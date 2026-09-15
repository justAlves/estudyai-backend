import { env } from "../../../config/env";

export class EmailError extends Error {}

const appUrl = (path: string) => `${env.APP_URL.replace(/\/$/, "")}${path}`;
const studentName = (name?: string | null) => name?.trim() || "estudante";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);

function layout(preheader: string, eyebrow: string, title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#fcfbfa;color:#2b201a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fcfbfa;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #eadfda;border-radius:24px;overflow:hidden"><tr><td style="height:7px;background:#d91b68;font-size:0">&nbsp;</td></tr><tr><td style="padding:30px 32px 10px"><div style="font-family:Georgia,serif;font-size:25px;font-weight:700;letter-spacing:-.5px">Estudy<span style="color:#d91b68">AI</span></div></td></tr><tr><td style="padding:18px 32px 34px"><div style="color:#d91b68;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(eyebrow)}</div><h1 style="margin:10px 0 16px;font-family:Georgia,serif;font-size:34px;line-height:1.08;letter-spacing:-.7px;color:#2b201a">${escapeHtml(title)}</h1><div style="font-size:16px;line-height:1.7;color:#665a53">${body}</div>${cta ? `<p style="margin:28px 0 4px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;border-radius:12px;background:#d91b68;color:#fff;padding:14px 20px;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(cta.label)}</a></p><p style="font-size:12px;color:#8a7c74">Se o botão não funcionar, acesse: <a href="${escapeHtml(cta.href)}" style="color:#d91b68">${escapeHtml(cta.href)}</a></p>` : ""}</td></tr><tr><td style="border-top:1px solid #f0e8e4;padding:20px 32px 28px;color:#94877f;font-size:12px;line-height:1.6">Você recebeu este e-mail porque possui uma conta no EstudyAI.<br>Estude um passo de cada vez. ✦</td></tr></table></td></tr></table></body></html>`;
}

export class EmailService {
  get isConfigured() {
    return !!env.RESEND_API_KEY && !!env.RESEND_FROM_EMAIL;
  }

  async send(input: { to: string; subject: string; html: string; text: string; idempotencyKey?: string }) {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) throw new EmailError("Resend não está configurado.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [input.to], subject: input.subject, html: input.html, text: input.text, ...(env.RESEND_REPLY_TO ? { reply_to: env.RESEND_REPLY_TO } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; name?: string } | null;
      throw new EmailError(body?.message ?? body?.name ?? `Resend recusou o envio (${response.status})`);
    }
  }

  async sendPlanReady(input: { to: string; name?: string | null; contestName: string; contestId: string }) {
    const name = escapeHtml(studentName(input.name));
    const contest = escapeHtml(input.contestName);
    await this.send({ to: input.to, subject: "Seu plano de estudos está pronto · EstudyAI", idempotencyKey: `plan-ready-${input.contestId}`, html: layout("Seu plano de estudos está pronto para começar.", "Seu próximo passo", "Seu plano está pronto", `<p>Olá, <strong>${name}</strong>!</p><p>A agenda para <strong>${contest}</strong> já foi organizada com teoria, prática e revisão para você avançar no seu ritmo.</p>`, { label: "Abrir meu plano", href: appUrl("/p") }), text: `Olá, ${studentName(input.name)}!\n\nSeu plano para ${input.contestName} está pronto. Acesse: ${appUrl("/p")}` });
  }

  async sendMaterialReady(input: { to: string; name?: string | null; subject: string; taskId: string }) {
    const name = escapeHtml(studentName(input.name));
    const subject = escapeHtml(input.subject);
    await this.send({ to: input.to, subject: `Sua aula de ${input.subject} está pronta · EstudyAI`, idempotencyKey: `material-ready-${input.taskId}`, html: layout(`Sua aula de ${input.subject} está pronta.`, "Hora de avançar", "Tem uma nova aula esperando por você", `<p>Olá, <strong>${name}</strong>!</p><p>Seu material de <strong>${subject}</strong> foi preparado com contexto do edital e questões para ajudar na fixação.</p>`, { label: "Abrir minha aula", href: appUrl(`/m/${input.taskId}`) }), text: `Olá, ${studentName(input.name)}!\n\nSua aula de ${input.subject} está pronta: ${appUrl(`/m/${input.taskId}`)}` });
  }

  async sendAdaptivePlan(input: { to: string; name?: string | null; subject: string; taskId: string }) {
    const name = escapeHtml(studentName(input.name));
    const subject = escapeHtml(input.subject);
    await this.send({ to: input.to, subject: "Seu plano foi adaptado ao seu desempenho · EstudyAI", idempotencyKey: `adaptive-plan-${input.taskId}`, html: layout("Seu plano foi adaptado com base no seu desempenho.", "Plano adaptativo", "Seu próximo passo foi ajustado", `<p>Olá, <strong>${name}</strong>!</p><p>Com base no seu desempenho, reorganizamos sua próxima atividade para reforçar <strong>${subject}</strong>.</p>`, { label: "Ver próximo estudo", href: appUrl(`/m/${input.taskId}`) }), text: `Olá, ${studentName(input.name)}!\n\nSeu plano foi adaptado. O próximo estudo é ${input.subject}: ${appUrl(`/m/${input.taskId}`)}` });
  }

  async sendPasswordResetCode(to: string, code: string) {
    await this.send({ to, subject: `${code} é seu código de acesso · EstudyAI`, idempotencyKey: `password-reset-${to}-${code}`, html: layout("Seu código de redefinição expira em 10 minutos.", "Segurança da conta", "Vamos recuperar seu acesso", `<p>Use o código abaixo para criar uma nova senha:</p><p style="margin:24px 0;text-align:center;font-size:34px;letter-spacing:10px;font-weight:700;color:#d91b68">${escapeHtml(code)}</p><p>Ele expira em <strong>10 minutos</strong>. Se você não solicitou esta alteração, ignore este e-mail.</p>`), text: `Seu código EstudyAI é ${code}. Ele expira em 10 minutos.` });
  }
}

export const emailService = new EmailService();
