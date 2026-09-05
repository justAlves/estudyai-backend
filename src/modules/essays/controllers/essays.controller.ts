import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import { ulid } from "ulid";
import { db } from "../../../database";
import { contests } from "../../../database/tables/contests.table";
import { essays } from "../../../database/tables/essays.table";
import { essayGenerationJobs } from "../../../database/tables/essay-generation-jobs.table";
import { accessControl, userIdFrom } from "../../../plugins/access-control";
import { suggestEssayTopic } from "../services/essay.service";
import { enqueueEssayGeneration } from "../../../queues";
import { apiLogger } from "../../../config/logger";
import { canConsumeMonthlyUsage, monthlyLimits } from "../../billing/services/usage-limits";
import { users } from "../../../database/tables/users.table";

function monthStart() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); }

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);
export const essaysController = new Elysia({ prefix: "/essays", tags: ["Essays"] }).use(accessControl)
  .get("/topic", async ({ set }) => { const startedAt = Date.now(); try { const topic = await suggestEssayTopic(); apiLogger.info({ path: "/essays/topic", durationMs: Date.now() - startedAt, topicLength: topic.length }, "tema de redação sugerido"); return { topic }; } catch (error) { apiLogger.error({ err: error, path: "/essays/topic", durationMs: Date.now() - startedAt }, "falha ao sugerir tema de redação"); set.status = 502; return { message: "Não foi possível sugerir um tema agora." }; } }, { auth: true })
  .get("/usage", async ({ headers, jwt }) => { const userId = await userIdFrom(headers.authorization, jwt.verify); const [user] = await db.select({ premium: users.premium }).from(users).where(eq(users.id, userId!)).limit(1); const [usage] = await db.select({ used: count() }).from(essays).innerJoin(contests, eq(essays.contestId, contests.id)).where(and(eq(contests.userId, userId!), gte(essays.createdAt, monthStart()), ne(essays.status, "FAILED"))); const plan = user?.premium ? "PRO" : "FREE"; const limit = monthlyLimits[plan].ESSAY; return { used: Number(usage?.used ?? 0), limit, remaining: Math.max(0, limit - Number(usage?.used ?? 0)), premium: !!user?.premium }; }, { auth: true })
  .get("/", async ({ headers, jwt }) => { const userId = await userIdFrom(headers.authorization, jwt.verify); return db.select({ id: essays.id, topic: essays.topic, status: essays.status, analysis: essays.analysis, fileName: essays.fileName, createdAt: essays.createdAt }).from(essays).innerJoin(contests, eq(essays.contestId, contests.id)).where(eq(contests.userId, userId!)).orderBy(desc(essays.createdAt)); }, { auth: true })
  .get("/:essayId", async ({ params, headers, jwt, set }) => { const userId = await userIdFrom(headers.authorization, jwt.verify); const [essay] = await db.select({ id: essays.id, topic: essays.topic, status: essays.status, analysis: essays.analysis, fileName: essays.fileName, createdAt: essays.createdAt }).from(essays).innerJoin(contests, eq(essays.contestId, contests.id)).where(and(eq(essays.id, params.essayId), eq(contests.userId, userId!))).limit(1); if (!essay) { set.status = 404; return { message: "Redação não encontrada." }; } return essay; }, { auth: true })
  .post("/", async ({ request, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const form = await request.formData();
    const input = { topic: form.get("topic"), essayText: form.get("essayText"), file: form.get("file") };
    const topic = String(input.topic ?? "").trim(); const essayText = String(input.essayText ?? "").trim(); const file = input.file instanceof File ? input.file : undefined;
    if (topic.length < 5) { set.status = 422; return { message: "Informe o tema da redação." }; }
    if (!essayText && !file) { set.status = 422; return { message: "Escreva a redação ou envie um arquivo." }; }
    if (essayText.length > 30_000) { set.status = 422; return { message: "A redação ultrapassa o limite de 30 mil caracteres." }; }
    if (file && (!allowedTypes.has(file.type) || file.size > 12 * 1024 * 1024)) { set.status = 422; return { message: "Envie PDF, imagem, Word ou TXT de até 12 MB." }; }
    const [contest] = await db.select({ id: contests.id }).from(contests).where(and(eq(contests.userId, userId!), eq(contests.isActive, true))).limit(1);
    if (!contest) { set.status = 404; return { message: "Concurso ativo não encontrado." }; }
    const [user] = await db.select({ premium: users.premium }).from(users).where(eq(users.id, userId!)).limit(1);
    const plan = user?.premium ? "PRO" : "FREE";
    const [usage] = await db.select({ used: count() }).from(essays).innerJoin(contests, eq(essays.contestId, contests.id)).where(and(eq(contests.userId, userId!), gte(essays.createdAt, monthStart()), ne(essays.status, "FAILED")));
    const used = Number(usage?.used ?? 0);
    if (!canConsumeMonthlyUsage(plan, "ESSAY", used)) { set.status = 429; apiLogger.warn({ userId, used, limit: monthlyLimits[plan].ESSAY }, "limite mensal de redações atingido"); return { message: `Você atingiu o limite de ${monthlyLimits[plan].ESSAY} análise de redação deste mês.`, used, limit: monthlyLimits[plan].ESSAY }; }
    try {
      const essayId = ulid(); const jobId = ulid();
      await db.transaction(async (tx) => { await tx.insert(essays).values({ id: essayId, contestId: contest.id, topic, essayText: essayText || null, fileName: file?.name ?? null, mimeType: file?.type ?? null, fileData: file ? Buffer.from(await file.arrayBuffer()) : null }); await tx.insert(essayGenerationJobs).values({ id: jobId, essayId }); });
      try { await enqueueEssayGeneration(jobId); } catch (error) { apiLogger.error({ err: error, essayId, jobId }, "falha ao enfileirar correção de redação"); await db.update(essays).set({ status: "FAILED" }).where(eq(essays.id, essayId)); set.status = 503; return { message: "O corretor está temporariamente indisponível." }; }
      apiLogger.info({ essayId, jobId, contestId: contest.id, fileName: file?.name, fileSize: file?.size, textLength: essayText.length }, "correção de redação enfileirada");
      set.status = 202; return { id: essayId, status: "QUEUED", topic };
    } catch (error) { apiLogger.error({ err: error, path: "/essays", userId }, "falha ao criar redação"); set.status = 500; return { message: error instanceof Error ? error.message : "Não foi possível iniciar a correção." }; }
  }, { auth: true });
