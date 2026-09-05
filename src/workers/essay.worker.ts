import { and, eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "../database";
import { essays } from "../database/tables/essays.table";
import { essayGenerationJobs } from "../database/tables/essay-generation-jobs.table";
import { analyzeEssay } from "../modules/essays/services/essay.service";
import { createWorker, enqueueEssayGeneration, queueNames } from "../queues";
import { workerLogger } from "../config/logger";

const logger = workerLogger("essays");

export async function processEssayJob(jobId: string) {
  logger.info({ jobId }, "job de redação recebido");
  const [queued] = await db.select({ job: essayGenerationJobs, essay: essays }).from(essayGenerationJobs).innerJoin(essays, eq(essayGenerationJobs.essayId, essays.id)).where(and(eq(essayGenerationJobs.id, jobId), eq(essayGenerationJobs.status, "QUEUED"), eq(essays.status, "QUEUED"))).limit(1);
  if (!queued) { logger.warn({ jobId }, "job de redação não encontrado ou já processado"); return; }
  const [job] = await db.update(essayGenerationJobs).set({ status: "PROCESSING", attemptCount: queued.job.attemptCount + 1, errorMessage: null }).where(and(eq(essayGenerationJobs.id, jobId), eq(essayGenerationJobs.status, "QUEUED"))).returning();
  if (!job) { logger.warn({ jobId }, "job de redação já foi assumido por outro worker"); return; }
  await db.update(essays).set({ status: "PROCESSING" }).where(and(eq(essays.id, queued.essay.id), eq(essays.status, "QUEUED")));
  try {
    const file = queued.essay.fileData && queued.essay.fileName ? new File([new Uint8Array(queued.essay.fileData)], queued.essay.fileName, { type: queued.essay.mimeType ?? "application/octet-stream" }) : undefined;
    logger.info({ jobId, essayId: queued.essay.id, attempt: job.attemptCount, hasFile: !!file, textLength: queued.essay.essayText?.length ?? 0 }, "iniciando análise da redação");
    const analysis = await analyzeEssay(queued.essay.topic, queued.essay.essayText ?? "", file);
    await db.transaction(async (tx) => { await tx.update(essays).set({ status: "COMPLETED", analysis, fileData: null }).where(eq(essays.id, queued.essay.id)); await tx.update(essayGenerationJobs).set({ status: "COMPLETED" }).where(eq(essayGenerationJobs.id, job.id)); });
    logger.info({ jobId, essayId: queued.essay.id }, "redação corrigida com sucesso");
  } catch (error) {
    const finalAttempt = job.attemptCount >= 3;
    await db.update(essayGenerationJobs).set({ status: finalAttempt ? "FAILED" : "QUEUED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida" }).where(eq(essayGenerationJobs.id, job.id));
    await db.update(essays).set({ status: finalAttempt ? "FAILED" : "QUEUED" }).where(eq(essays.id, queued.essay.id));
    logger.error({ err: error, jobId, essayId: queued.essay.id }, "falha ao corrigir redação");
    throw error;
  }
}

async function enqueuePendingEssayJobs() { const jobs = await db.select({ id: essayGenerationJobs.id }).from(essayGenerationJobs).where(eq(essayGenerationJobs.status, "QUEUED")); await Promise.all(jobs.map(({ id }) => enqueueEssayGeneration(id))); }
if (import.meta.main) { await enqueuePendingEssayJobs(); const worker = createWorker<{ jobId: string }>(queueNames.essays, async (job: Job<{ jobId: string }>) => processEssayJob(job.data.jobId)); worker.on("error", (error) => logger.error({ err: error }, "erro de conexão do worker")); logger.info("worker online · aguardando redações"); }
