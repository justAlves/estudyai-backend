import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
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
import { workerLogger } from "../config/logger";

const logger = workerLogger("materials");
const MAX_RETRY_ATTEMPTS = 5;

async function processNextJob() {
  const [queued] = await db.select().from(materialGenerationJobs).where(and(eq(materialGenerationJobs.status, "QUEUED"), or(isNull(materialGenerationJobs.nextAttemptAt), lte(materialGenerationJobs.nextAttemptAt, new Date())))).orderBy(asc(materialGenerationJobs.createdAt)).limit(1);
  if (!queued) return false;

  const [job] = await db.update(materialGenerationJobs).set({ status: "PROCESSING" }).where(and(eq(materialGenerationJobs.id, queued.id), eq(materialGenerationJobs.status, "QUEUED"))).returning();
  if (!job) return true;
  logger.info({ jobId: job.id, taskId: job.taskId }, "gerando material");

  try {
    const [task] = await db.select({ subject: studyTasks.subject, type: studyTasks.type, phone: users.phone, socialName: users.socialName, name: users.name }).from(studyTasks).innerJoin(contests, eq(studyTasks.contestId, contests.id)).innerJoin(users, eq(contests.userId, users.id)).where(eq(studyTasks.id, job.taskId)).limit(1);
    if (!task) throw new Error("Tarefa não encontrada");

    const questions = await searchQuestions(task.subject, 6);
    if (!questions.length) throw new Error("Não há questões relevantes no RAG");
    logger.info({ jobId: job.id, taskId: job.taskId, questions: questions.length }, "contexto RAG recuperado");
    const content = await generateMaterial(task.subject, questions);
    const activities = task.type === "QUESTIONS" ? await generateActivities(task.subject, questions) : [];
    await db.insert(studyMaterials).values({ id: ulid(), taskId: job.taskId, content, sources: sourceList(questions), activities }).onConflictDoNothing();
    await db.update(materialGenerationJobs).set({ status: "COMPLETED" }).where(eq(materialGenerationJobs.id, job.id));
    if (whatsAppService.isConfigured) await whatsAppService.sendText(task.phone, materialReadyMessage(task.socialName ?? task.name, task.subject, job.taskId));
    logger.info({ jobId: job.id, taskId: job.taskId }, "material concluído");
  } catch (error) {
    logger.error({ err: error, jobId: job.id, taskId: job.taskId }, "falha ao gerar material");
    const attemptCount = job.attemptCount + 1;
    if (error instanceof GeminiGenerationError && error.retryable && attemptCount <= MAX_RETRY_ATTEMPTS) {
      const delayMs = error.retryAfterMs ?? materialRetryDelayMs(attemptCount);
      const nextAttemptAt = new Date(Date.now() + delayMs);
      await db.update(materialGenerationJobs).set({ status: "QUEUED", attemptCount, nextAttemptAt }).where(eq(materialGenerationJobs.id, job.id));
      logger.warn({ jobId: job.id, taskId: job.taskId, attemptCount, nextAttemptAt }, "material será tentado novamente");
    } else {
      await db.update(materialGenerationJobs).set({ status: "FAILED", attemptCount, nextAttemptAt: null }).where(eq(materialGenerationJobs.id, job.id));
    }
  }
  return true;
}

if (import.meta.main) {
  logger.info("worker iniciado; aguardando materiais");
  while (true) {
    await processNextJob();
    await Bun.sleep(2_000);
  }
}
