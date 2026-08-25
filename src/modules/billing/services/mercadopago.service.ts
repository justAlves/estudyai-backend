import { env } from "../../../config/env";

type MercadoPagoResponse<T> = T & { message?: string; error?: string };

export class MercadoPagoError extends Error {}

async function request<T>(path: string, init: RequestInit = {}) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) throw new MercadoPagoError("Mercado Pago não está configurado.");
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => null) as MercadoPagoResponse<T> | null;
  if (!response.ok || !body) throw new MercadoPagoError(body?.message ?? body?.error ?? "Mercado Pago não respondeu corretamente.");
  return body;
}

export type MercadoPagoSubscription = { id: string; init_point: string; status: string };

export async function createProCheckout(input: { email: string; externalId: string; backUrl: string; notificationUrl: string }) {
  return request<MercadoPagoSubscription>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: "EstudyAI Pro",
      external_reference: input.externalId,
      payer_email: input.email,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: env.MERCADOPAGO_PRO_PRICE_CENTS / 100, currency_id: "BRL" },
      back_url: input.backUrl,
      notification_url: input.notificationUrl,
      status: "pending",
    }),
  });
}

export async function getSubscription(id: string) {
  return request<MercadoPagoSubscription>(`/preapproval/${encodeURIComponent(id)}`);
}

export async function cancelProSubscription(id: string) {
  return request<MercadoPagoSubscription>(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
}
