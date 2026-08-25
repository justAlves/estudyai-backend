import { env } from "../../../config/env";

type AbacateResponse<T> = { data: T; success: boolean; error: string | null };

export class BillingError extends Error {}

function paymentMethodUnavailable(error: unknown, method: "CARD" | "PIX") {
  return error instanceof BillingError && new RegExp(`${method}.*not available for this store`, "i").test(error.message);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!env.ABACATEPAY_API_KEY) throw new BillingError("Abacate Pay não está configurada.");

  const response = await fetch(`https://api.abacatepay.com/v2${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.ABACATEPAY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as AbacateResponse<T>;
  if (!response.ok || !payload.success) throw new BillingError(payload.error ?? "Não foi possível iniciar o pagamento.");
  return payload.data;
}

export async function createProCheckout(input: { userId: string; email: string; name: string; phone: string; externalId: string }) {
  if (!env.ABACATEPAY_PRO_PRODUCT_ID) throw new BillingError("Produto Pro não configurado.");
  const customer = await post<{ id: string }>("/customers/create", { email: input.email, name: input.name, cellphone: input.phone });
  return post<{ id: string; url: string }>("/subscriptions/create", {
    items: [{ id: env.ABACATEPAY_PRO_PRODUCT_ID, quantity: 1 }],
    customerId: customer.id,
    externalId: input.externalId,
    completionUrl: `${env.APP_URL}/dashboard?payment=success`,
    returnUrl: `${env.APP_URL}/dashboard?payment=cancelled`,
    methods: ["PIX"],
  });
}

export async function cancelProSubscription(providerSubscriptionId: string) {
  return post("/subscriptions/cancel", { id: providerSubscriptionId });
}
