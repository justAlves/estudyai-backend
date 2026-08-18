import { env } from "../../../config/env";

export class WhatsAppError extends Error {}

export const toWhatsAppNumber = (phone: string) => phone.replace(/\D/g, "");

export class WhatsAppService {
  get isConfigured() {
    return !!env.EVOLUTION_GO_URL && !!env.EVOLUTION_GO_API_KEY && !!env.EVOLUTION_INSTANCE_NAME;
  }

  async sendText(to: string, text: string) {
    const { EVOLUTION_GO_API_KEY: apiKey, EVOLUTION_GO_URL: url, EVOLUTION_INSTANCE_NAME: instance } = env;

    if (!url || !apiKey || !instance) {
      throw new WhatsAppError("Evolution GO não está configurada");
    }

    const response = await fetch(`${url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ number: toWhatsAppNumber(to), text }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; error?: string; response?: { message?: string | string[][] } } | null;
      const detail = body?.response?.message;
      const message = typeof detail === "string" ? detail : detail?.flat().join(" ");
      throw new WhatsAppError(message ?? body?.message ?? body?.error ?? `Evolution recusou o envio (${response.status})`);
    }
  }
}

export const whatsAppService = new WhatsAppService();
