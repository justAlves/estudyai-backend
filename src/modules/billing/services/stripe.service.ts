import Stripe from "stripe";
import { env } from "../../../config/env";

export class StripeBillingError extends Error {}

function stripeClient() {
  if (!env.STRIPE_SECRET_KEY) throw new StripeBillingError("Stripe não está configurada.");
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export async function createProCheckout(input: { email: string; externalId: string; backUrl: string }) {
  if (!env.STRIPE_PRO_PRICE_ID) throw new StripeBillingError("Configure o preço Pro da Stripe.");
  const session = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    customer_email: input.email,
    line_items: [{ price: env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
    client_reference_id: input.externalId,
    metadata: { subscription_id: input.externalId },
    subscription_data: { metadata: { subscription_id: input.externalId } },
    success_url: `${input.backUrl}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: input.backUrl,
  });
  if (!session.url) throw new StripeBillingError("A Stripe não retornou a URL do checkout.");
  return { id: session.id, url: session.url };
}

export async function cancelProSubscription(providerSubscriptionId: string) {
  return stripeClient().subscriptions.cancel(providerSubscriptionId);
}

export async function constructStripeEvent(payload: string, signature: string | null) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new StripeBillingError("Configure o segredo do webhook da Stripe.");
  if (!signature) throw new StripeBillingError("Assinatura do webhook ausente.");
  return stripeClient().webhooks.constructEventAsync(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}
