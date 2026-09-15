import { Elysia } from "elysia";
import { and, desc, eq, or } from "drizzle-orm";
import { ulid } from "ulid";
import { env } from "../../../config/env";
import { db } from "../../../database";
import { subscriptions } from "../../../database/tables/subscriptions.table";
import { users } from "../../../database/tables/users.table";
import { webhookEvents } from "../../../database/tables/webhook-events.table";
import { contests } from "../../../database/tables/contests.table";
import { planGenerationJobs } from "../../../database/tables/plan-generation-jobs.table";
import { accessControl, userIdFrom } from "../../../plugins/access-control";
import { enqueuePlanGeneration } from "../../../queues";
import { StripeBillingError, cancelProSubscription, constructStripeEvent, createProCheckout } from "../services/stripe.service";

function subscriptionState(status: string) {
  if (["active", "trialing"].includes(status.toLowerCase())) return "ACTIVE" as const;
  if (["canceled", "unpaid", "incomplete_expired"].includes(status.toLowerCase())) return "CANCELLED" as const;
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
      const checkout = await createProCheckout({ email: user.email, externalId: id, backUrl: `${env.APP_URL}/dashboard?payment=returned` });
      await db.insert(subscriptions).values({ id, userId, providerCheckoutId: checkout.id, status: "PENDING" });
      return { url: checkout.url };
    } catch (error) {
      set.status = 503;
      return { message: error instanceof StripeBillingError ? error.message : "Não foi possível iniciar o pagamento." };
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
      return { message: error instanceof StripeBillingError ? error.message : "Não foi possível cancelar a assinatura." };
    }
  }, { premium: true })
  .post("/webhooks/stripe", async ({ request, set }) => {
    let event;
    try {
      event = await constructStripeEvent(await request.text(), request.headers.get("stripe-signature"));
    } catch (error) {
      set.status = 400;
      return { message: error instanceof StripeBillingError ? error.message : "Webhook inválido" };
    }

    const object = event.data.object as unknown as Record<string, unknown>;
    const metadata = (object.metadata as Record<string, string> | null) ?? {};
    const providerCheckoutId = event.type.startsWith("checkout.session.") ? String(object.id) : undefined;
    const providerSubscriptionId = typeof object.subscription === "string" ? object.subscription : event.type.startsWith("customer.subscription.") ? String(object.id) : undefined;
    const externalReference = (typeof object.client_reference_id === "string" ? object.client_reference_id : undefined) ?? metadata.subscription_id;

    let state: ReturnType<typeof subscriptionState> | undefined;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid"].includes(event.type)) state = "ACTIVE";
    if (event.type === "invoice.payment_failed") state = "PENDING";
    if (event.type.startsWith("customer.subscription.")) state = subscriptionState(typeof object.status === "string" ? object.status : "incomplete");
    if (event.type === "customer.subscription.deleted") state = "CANCELLED";
    if (!state) return { received: true, ignored: true };

    const [localSubscription] = await db.select().from(subscriptions).where(or(
      providerCheckoutId ? eq(subscriptions.providerCheckoutId, providerCheckoutId) : undefined,
      providerSubscriptionId ? eq(subscriptions.providerSubscriptionId, providerSubscriptionId) : undefined,
      externalReference ? eq(subscriptions.id, externalReference) : undefined,
    )).limit(1);
    if (!localSubscription) return { received: true, ignored: true };

    const [eventLog] = await db.insert(webhookEvents).values([{ id: event.id }]).onConflictDoNothing().returning();
    if (!eventLog) return { received: true, duplicate: true };

    const becameActive = state === "ACTIVE" && localSubscription.status !== "ACTIVE";
    await db.transaction(async (tx) => {
      await tx.update(subscriptions).set({ providerSubscriptionId: providerSubscriptionId ?? localSubscription.providerSubscriptionId, status: state }).where(eq(subscriptions.id, localSubscription.id));
      await tx.update(users).set({ premium: state === "ACTIVE" }).where(eq(users.id, localSubscription.userId));
    });
    if (becameActive) {
      const activeContests = await db.select({ id: contests.id }).from(contests).where(and(eq(contests.userId, localSubscription.userId), eq(contests.isActive, true)));
      for (const contest of activeContests) {
        const [job] = await db.insert(planGenerationJobs).values({ id: ulid(), contestId: contest.id }).onConflictDoUpdate({ target: planGenerationJobs.contestId, set: { status: "QUEUED", updatedAt: new Date() } }).returning({ id: planGenerationJobs.id });
        if (job) await enqueuePlanGeneration(job.id);
      }
    }
    return { received: true };
  }, { parse: "none" });
