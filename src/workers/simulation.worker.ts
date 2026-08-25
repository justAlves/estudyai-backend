import { and, eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { ulid } from "ulid";
import { db } from "../database";
import { contests } from "../database/tables/contests.table";
import { simulationGenerationJobs } from "../database/tables/simulation-generation-jobs.table";
import { simulationQuestions } from "../database/tables/simulation-questions.table";
import { simulations } from "../database/tables/simulations.table";
import { workerLogger } from "../config/logger";
import { createWorker, enqueueSimulationGeneration, queueNames } from "../queues";
import { generateSimulationQuestions } from "../modules/simulations/services/simulation.service";

const logger = workerLogger("simulations");
const BATCH_SIZE = 5;

export async function processSimulationJob(jobId: string, attempt = 0) {
  const [queued] = await db.select({ job: simulationGenerationJobs, simulation: simulations, contest: contests }).from(simulationGenerationJobs).innerJoin(simulations, eq(simulationGenerationJobs.simulationId, simulations.id)).innerJoin(contests, eq(simulations.contestId, contests.id)).where(and(eq(simulationGenerationJobs.id, jobId), eq(simulationGenerationJobs.status, "QUEUED"), eq(simulations.status, "QUEUED"))).limit(1);
  if (!queued) return;
  const [job] = await db.update(simulationGenerationJobs).set({ status: "PROCESSING", attemptCount: queued.job.attemptCount + 1, errorMessage: null }).where(and(eq(simulationGenerationJobs.id, queued.job.id), eq(simulationGenerationJobs.status, "QUEUED"))).returning();
  if (!job) return;
  await db.update(simulations).set({ status: "PROCESSING" }).where(and(eq(simulations.id, queued.simulation.id), eq(simulations.status, "QUEUED")));
  logger.info({ jobId: job.id, simulationId: queued.simulation.id, questions: queued.simulation.questionCount, attempt: attempt + 1 }, "iniciando geração do simulado");

  try {
    const existing = await db.select({ position: simulationQuestions.position }).from(simulationQuestions).where(eq(simulationQuestions.simulationId, queued.simulation.id));
    const firstPosition = existing.length ? Math.max(...existing.map(({ position }) => position)) : 0;
    for (let position = firstPosition; position < queued.simulation.questionCount; position += BATCH_SIZE) {
      const quantity = Math.min(BATCH_SIZE, queued.simulation.questionCount - position);
      const questions = await generateSimulationQuestions(queued.contest.name, queued.contest.examiningBoard, queued.simulation.contestId, queued.simulation.subjects, quantity);
      await db.insert(simulationQuestions).values(questions.map((question, index) => ({ id: ulid(), simulationId: queued.simulation.id, position: position + index + 1, ...question })));
      logger.debug({ jobId: job.id, simulationId: queued.simulation.id, generated: position + quantity, total: queued.simulation.questionCount }, "lote de questões gerado");
    }
    await db.update(simulationGenerationJobs).set({ status: "COMPLETED" }).where(eq(simulationGenerationJobs.id, job.id));
    await db.update(simulations).set({ status: "COMPLETED" }).where(eq(simulations.id, queued.simulation.id));
    logger.info({ jobId: job.id, simulationId: queued.simulation.id, questions: queued.simulation.questionCount }, "simulado gerado com sucesso");
  } catch (error) {
    const finalAttempt = attempt >= 2;
    logger.error({ err: error, jobId: job.id, simulationId: queued.simulation.id, attempt: attempt + 1 }, "falha ao gerar simulado");
    await db.update(simulationGenerationJobs).set({ status: finalAttempt ? "FAILED" : "QUEUED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida" }).where(eq(simulationGenerationJobs.id, job.id));
    await db.update(simulations).set({ status: finalAttempt ? "FAILED" : "QUEUED" }).where(eq(simulations.id, queued.simulation.id));
    throw error;
  }
}

async function enqueuePendingSimulationJobs() {
  const jobs = await db.select({ id: simulationGenerationJobs.id }).from(simulationGenerationJobs).where(eq(simulationGenerationJobs.status, "QUEUED"));
  await Promise.all(jobs.map(({ id }) => enqueueSimulationGeneration(id)));
  logger.debug({ jobs: jobs.length }, "jobs de simulados sincronizados com o broker");
}

if (import.meta.main) {
  await enqueuePendingSimulationJobs();
  const worker = createWorker<{ jobId: string }>(queueNames.simulations, async (job: Job<{ jobId: string }>) => processSimulationJob(job.data.jobId, job.attemptsMade));
  worker.on("error", (error) => logger.error({ err: error }, "erro de conexão do worker"));
  worker.on("completed", (job) => logger.debug({ jobId: job.data.jobId }, "job de simulado finalizado"));
  logger.info("worker online · aguardando simulados");
}
