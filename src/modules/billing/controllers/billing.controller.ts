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
import { MercadoPagoError, cancelProSubscription, createProCheckout, getSubscription } from "../services/mercadopago.service";

type MercadoPagoWebhook = { id?: number | string; type?: string; action?: string; data?: { id?: string | number } };

function validMercadoPagoSignature(signature: string | null, requestId: string | null, dataId: string | undefined) {
  if (!signature || !requestId || !dataId || !env.MERCADOPAGO_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", env.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest("hex");
  const actual = Buffer.from(parts.v1 ?? "");
  const expectedBuffer = Buffer.from(expected);
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function subscriptionState(status: string) {
  if (status === "authorized") return "ACTIVE" as const;
  if (["cancelled", "canceled", "paused"].includes(status)) return "CANCELLED" as const;
  return "PENDING" as const;
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
      if (!env.MERCADOPAGO_NOTIFICATION_URL) throw new MercadoPagoError("Configure MERCADOPAGO_NOTIFICATION_URL com a URL pública da API.");
      const checkout = await createProCheckout({ email: user.email, externalId: id, backUrl: `${env.APP_URL}/dashboard?payment=returned`, notificationUrl: env.MERCADOPAGO_NOTIFICATION_URL });
      await db.insert(subscriptions).values({ id, userId, providerCheckoutId: checkout.id, providerSubscriptionId: checkout.id, status: subscriptionState(checkout.status) });
      return { url: checkout.init_point };
    } catch (error) {
      set.status = 503;
      return { message: error instanceof MercadoPagoError ? error.message : "Não foi possível iniciar o pagamento." };
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
      return { message: error instanceof MercadoPagoError ? error.message : "Não foi possível cancelar a assinatura." };
    }
  }, { premium: true })
  .post("/webhooks/mercadopago", async ({ request, set }) => {
    const event = await request.json() as MercadoPagoWebhook;
    const dataId = event.data?.id === undefined ? undefined : String(event.data.id);
    if (!event.id || event.type !== "subscription_preapproval" || !dataId || !validMercadoPagoSignature(request.headers.get("x-signature"), request.headers.get("x-request-id"), dataId)) {
      set.status = 401;
      return { message: "Webhook inválido" };
    }

    const subscription = await getSubscription(dataId);
    const [eventLog] = await db.insert(webhookEvents).values([{ id: String(event.id) }]).onConflictDoNothing().returning();
    if (!eventLog) return { received: true, duplicate: true };

    const [localSubscription] = await db.select().from(subscriptions).where(or(eq(subscriptions.providerSubscriptionId, dataId), eq(subscriptions.providerCheckoutId, dataId))).limit(1);
    if (!localSubscription) {
      set.status = 404;
      return { message: "Assinatura desconhecida" };
    }
    const state = subscriptionState(subscription.status);
    await db.transaction(async (tx) => {
      await tx.update(subscriptions).set({ providerSubscriptionId: dataId, status: state }).where(eq(subscriptions.id, localSubscription.id));
      await tx.update(users).set({ premium: state === "ACTIVE" }).where(eq(users.id, localSubscription.userId));
    });
    return { received: true };
  }, { parse: "none" });
