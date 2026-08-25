import { and, eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { ulid } from "ulid";
import { db } from "../database";
import { contests } from "../database/tables/contests.table";
import { materialGenerationJobs } from "../database/tables/material-generation-jobs.table";
import { studyMaterials } from "../database/tables/study-materials.table";
import { studyTasks } from "../database/tables/study-tasks.table";
import { users } from "../database/tables/users.table";
import { materialReadyMessage, whatsAppService } from "../modules/notifications/services/whatsapp.service";
import { searchQuestions } from "../modules/rag/services/rag.service";
import { GeminiGenerationError, generateActivities, generateMaterial, materialRetryDelayMs, sourceList } from "../modules/study/services/material.service";
import { syllabusContext } from "../modules/onboarding/services/contest-syllabus.service";
import { workerLogger } from "../config/logger";
import { createWorker, enqueueMaterialGeneration, queueNames } from "../queues";

const logger = workerLogger("materials");
const MAX_RETRY_ATTEMPTS = 5;

export async function processMaterialJob(jobId: string) {
  const [queued] = await db.select().from(materialGenerationJobs).where(and(eq(materialGenerationJobs.id, jobId), eq(materialGenerationJobs.status, "QUEUED"))).limit(1);
  if (!queued) return;

  const [job] = await db.update(materialGenerationJobs).set({ status: "PROCESSING" }).where(and(eq(materialGenerationJobs.id, queued.id), eq(materialGenerationJobs.status, "QUEUED"))).returning();
  if (!job) return;
  logger.info({ jobId: job.id, taskId: job.taskId, attempt: job.attemptCount + 1 }, "iniciando geração do material");

  try {
    const [task] = await db.select({ subject: studyTasks.subject, type: studyTasks.type, estimatedMinutes: studyTasks.estimatedMinutes, contestId: contests.id, contestName: contests.name, phone: users.phone, socialName: users.socialName, name: users.name }).from(studyTasks).innerJoin(contests, eq(studyTasks.contestId, contests.id)).innerJoin(users, eq(contests.userId, users.id)).where(eq(studyTasks.id, job.taskId)).limit(1);
    if (!task) throw new Error("Tarefa não encontrada");

    const syllabus = await syllabusContext(task.contestName, task.subject, task.contestId);
    const questions = await searchQuestions(task.subject, 6);
    if (!questions.length && !syllabus) throw new Error("Não há contexto de edital ou questões para esta matéria");
    logger.debug({ jobId: job.id, taskId: job.taskId, questions: questions.length, syllabus: !!syllabus }, "contexto de estudo recuperado");
    const content = await generateMaterial(task.subject, questions, syllabus, task.estimatedMinutes);
    const activities = task.type === "QUESTIONS" ? await generateActivities(task.subject, questions, syllabus) : [];
    await db.insert(studyMaterials).values({ id: ulid(), taskId: job.taskId, content, sources: sourceList(questions), activities }).onConflictDoNothing();
    await db.update(materialGenerationJobs).set({ status: "COMPLETED" }).where(eq(materialGenerationJobs.id, job.id));
    if (whatsAppService.isConfigured) await whatsAppService.sendText(task.phone, materialReadyMessage(task.socialName ?? task.name, task.subject, job.taskId));
    logger.info({ jobId: job.id, taskId: job.taskId }, "material gerado com sucesso");
  } catch (error) {
    logger.error({ err: error, jobId: job.id, taskId: job.taskId, attempt: job.attemptCount + 1 }, "falha ao gerar material");
    const attemptCount = job.attemptCount + 1;
    if (error instanceof GeminiGenerationError && error.retryable && attemptCount <= MAX_RETRY_ATTEMPTS) {
      const delayMs = error.retryAfterMs ?? materialRetryDelayMs(attemptCount);
      const nextAttemptAt = new Date(Date.now() + delayMs);
      await db.update(materialGenerationJobs).set({ status: "QUEUED", attemptCount, nextAttemptAt }).where(eq(materialGenerationJobs.id, job.id));
      logger.warn({ jobId: job.id, taskId: job.taskId, attempt: attemptCount, retryAt: nextAttemptAt }, "material agendado para nova tentativa");
      throw error;
    } else {
      await db.update(materialGenerationJobs).set({ status: "FAILED", attemptCount, nextAttemptAt: null }).where(eq(materialGenerationJobs.id, job.id));
    }
  }
}

async function enqueuePendingMaterialJobs() {
  const jobs = await db.select({ id: materialGenerationJobs.id }).from(materialGenerationJobs).where(eq(materialGenerationJobs.status, "QUEUED"));
  await Promise.all(jobs.map(({ id }) => enqueueMaterialGeneration(id)));
  logger.debug({ jobs: jobs.length }, "jobs de materiais sincronizados com o broker");
}

if (import.meta.main) {
  await enqueuePendingMaterialJobs();
  const worker = createWorker<{ jobId: string }>(queueNames.materials, async (job: Job<{ jobId: string }>) => processMaterialJob(job.data.jobId));
  worker.on("error", (error) => logger.error({ err: error }, "erro de conexão do worker"));
  worker.on("completed", (job) => logger.debug({ jobId: job.data.jobId }, "job de material finalizado"));
  logger.info("worker online · aguardando materiais");
}
