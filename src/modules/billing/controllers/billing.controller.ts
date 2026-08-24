import { createHmac, timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { and, desc, eq, or } from "drizzle-orm";
import { ulid } from "ulid";
import { env } from "../../../config/env";
import { db } from "../../../database";
import { subscriptions } from "../../../database/tables/subscriptions.table";
import { users } from "../../../database/tables/users.table";
import { webhookEvents } from "../../../database/tables/webhook-events.table";
import { accessControl, userIdFrom } from "../../../plugins/access-control";
import { BillingError, cancelProSubscription, createProCheckout } from "../services/abacatepay.service";
import { billingEventState } from "../services/billing-rules";

type Webhook = {
  id?: string;
  event?: string;
  data?: { subscription?: { id?: string }; checkout?: { id?: string; externalId?: string } };
};

const abacatePayPublicKey = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

function validSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha256", abacatePayPublicKey).update(rawBody).digest("base64");
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export const billingController = new Elysia({ prefix: "/billing", tags: ["Billing"] })
  .use(accessControl)
  .get("/status", async ({ headers, jwt }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) return { premium: false };
    const [user] = await db.select({ premium: users.premium }).from(users).where(eq(users.id, userId)).limit(1);
    return { premium: !!user?.premium };
  }, { auth: true })
  .post("/checkout", async ({ headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) {
      set.status = 401;
      return { message: "Token inválido ou ausente" };
    }
    const [user] = await db.select({ email: users.email, name: users.socialName, fallbackName: users.name, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      set.status = 401;
      return { message: "Usuário não encontrado" };
    }

    try {
      const id = ulid();
      const checkout = await createProCheckout({ userId, email: user.email, name: user.name || user.fallbackName, phone: user.phone, externalId: id });
      await db.insert(subscriptions).values({ id, userId, providerCheckoutId: checkout.id });
      return { url: checkout.url };
    } catch (error) {
      set.status = 503;
      return { message: error instanceof BillingError ? error.message : "Não foi possível iniciar o pagamento." };
    }
  }, { auth: true })
  .post("/cancel", async ({ headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) {
      set.status = 401;
      return { message: "Token inválido ou ausente" };
    }
    const [subscription] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "ACTIVE"))).orderBy(desc(subscriptions.createdAt)).limit(1);
    if (!subscription?.providerSubscriptionId) {
      set.status = 404;
      return { message: "Assinatura ativa não encontrada." };
    }

    try {
      await cancelProSubscription(subscription.providerSubscriptionId);
      return { cancelled: true };
    } catch (error) {
      set.status = 503;
      return { message: error instanceof BillingError ? error.message : "Não foi possível cancelar a assinatura." };
    }
  }, { premium: true })
  .post("/webhooks/abacatepay", async ({ request, query, set }) => {
    const rawBody = await request.text();
    if (query.webhookSecret !== env.ABACATEPAY_WEBHOOK_SECRET || !validSignature(rawBody, request.headers.get("X-Webhook-Signature"))) {
      set.status = 401;
      return { message: "Webhook inválido" };
    }

    const event = JSON.parse(rawBody) as Webhook;
    const subscriptionId = event.data?.subscription?.id;
    const checkoutId = event.data?.checkout?.id;
    const externalId = event.data?.checkout?.externalId;
    const eventId = event.id;
    if (!eventId || !event.event || !subscriptionId) {
      set.status = 400;
      return { message: "Evento inválido" };
    }

    const state = billingEventState(event.event);
    if (!state) return { received: true };

    const processed = await db.transaction(async (tx) => {
      const [eventLog] = await tx.insert(webhookEvents).values([{ id: eventId }]).onConflictDoNothing().returning();
      if (!eventLog) return true;

      const [subscription] = await tx.select().from(subscriptions).where(or(
        eq(subscriptions.providerSubscriptionId, subscriptionId),
        ...(checkoutId ? [eq(subscriptions.providerCheckoutId, checkoutId)] : []),
        ...(externalId ? [eq(subscriptions.id, externalId)] : []),
      )).limit(1);
      if (!subscription) throw new Error("Assinatura desconhecida");

      await tx.update(subscriptions).set({ providerSubscriptionId: subscriptionId, status: state }).where(eq(subscriptions.id, subscription.id));
      await tx.update(users).set({ premium: state === "ACTIVE" }).where(eq(users.id, subscription.userId));
      return false;
    });

    return { received: true, duplicate: processed };
  }, { query: undefined, parse: "none" });
