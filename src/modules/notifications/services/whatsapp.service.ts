import { env } from "../../../config/env";

export class WhatsAppError extends Error {}

export const toWhatsAppNumber = (phone: string) => phone.replace(/\D/g, "");
const appUrl = (path: string) => `${env.APP_URL.replace(/\/$/, "")}${path}`;
const studentName = (socialName?: string | null) => socialName?.trim() || "estudante";

export function planReadyMessage(socialName: string | null, contestName: string, variation = Math.floor(Math.random() * 3)) {
  const opening = ["Seu plano está pronto para sair do papel.", "Seu próximo passo já está organizado.", "Hoje pode ser o começo de uma boa sequência."][variation % 3];
  return `🗓️ *${studentName(socialName)},* ${opening}\n\n*${contestName}*\n\n👉 Abrir meu plano: ${appUrl("/p")}`;
}

export function materialReadyMessage(socialName: string | null, subject: string, taskId: string, variation = Math.floor(Math.random() * 3)) {
  const opening = [`sua aula de *${subject}* está pronta.`, `é hora de avançar em *${subject}*.`, `tem um novo passo esperando por você: *${subject}*.`][variation % 3];
  return `🎯 *${studentName(socialName)},* ${opening}\n\nUm estudo de cada vez também é progresso.\n\n👉 Abrir aula: ${appUrl(`/m/${taskId}`)}`;
}

export class WhatsAppService {
  get isConfigured() {
    return !!env.EVOLUTION_GO_URL && !!env.EVOLUTION_GO_API_KEY && !!env.EVOLUTION_INSTANCE_NAME;
  }

  async sendText(to: string, text: string) {
    const { EVOLUTION_GO_API_KEY: apiKey, EVOLUTION_GO_URL: url, EVOLUTION_INSTANCE_NAME: instance } = env;

    if (!url || !apiKey || !instance) {
      throw new WhatsAppError("Evolution API não está configurada");
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
