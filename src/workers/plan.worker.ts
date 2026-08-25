import { and, eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { ulid } from "ulid";
import { db } from "../database";
import { contestSupportSubjects } from "../database/tables/contest-support-subjects.table";
import { contests } from "../database/tables/contests.table";
import { planGenerationJobs } from "../database/tables/plan-generation-jobs.table";
import { studyTasks } from "../database/tables/study-tasks.table";
import { contestNoticeDocuments } from "../database/tables/contest-notice-documents.table";
import { users } from "../database/tables/users.table";
import { knownSubjectsForContest, uniqueSubjects } from "../modules/onboarding/services/known-contests.service";
import { syllabusSubjectsForContest } from "../modules/onboarding/services/contest-syllabus.service";
import { planReadyMessage, whatsAppService } from "../modules/notifications/services/whatsapp.service";
import { workerLogger } from "../config/logger";
import { createWorker, enqueuePlanGeneration, queueNames } from "../queues";

const logger = workerLogger("plans");

type TaskType = "STUDY" | "QUESTIONS" | "REVIEW";

export function initialTasks(subjects: string[], minutes: number, from = new Date()) {
  if (!subjects.length) throw new Error("Plano sem matérias");
  if (!Number.isInteger(minutes) || minutes <= 0) throw new Error("Meta diária inválida");
  const tasks: { subject: string; type: TaskType; title: string; estimatedMinutes: number; scheduledFor: string }[] = [];
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let studyDay = 0;

  while (studyDay < 20) {
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      const subject = subjects[studyDay % subjects.length];
      const scheduledFor = date.toISOString().slice(0, 10);
      const studyMinutes = Math.ceil(minutes * 0.6);
      const practiceMinutes = minutes - studyMinutes;
      tasks.push({ subject, type: "STUDY", title: `Estudar ${subject}`, estimatedMinutes: studyMinutes, scheduledFor });
      tasks.push({ subject, type: studyDay < 5 ? "QUESTIONS" : "REVIEW", title: studyDay < 5 ? `Resolver questões de ${subject}` : `Revisar ${subject}`, estimatedMinutes: practiceMinutes, scheduledFor });
      studyDay += 1;
    }
    date.setDate(date.getDate() + 1);
  }

  return tasks;
}

export async function processPlanJob(jobId: string, attempt = 0) {
  const [queued] = await db.select().from(planGenerationJobs).where(and(eq(planGenerationJobs.id, jobId), eq(planGenerationJobs.status, "QUEUED"))).limit(1);
  if (!queued) return;

  const [job] = await db.update(planGenerationJobs).set({ status: "PROCESSING" }).where(and(eq(planGenerationJobs.id, queued.id), eq(planGenerationJobs.status, "QUEUED"))).returning();
  if (!job) return;
  logger.info({ jobId: job.id, contestId: job.contestId, attempt: attempt + 1 }, "iniciando geração do plano");

  try {
    const [contest] = await db.select().from(contests).where(eq(contests.id, job.contestId)).limit(1);
    if (!contest) throw new Error("Plano não encontrado");
    const selectedSubjects = await db.select().from(contestSupportSubjects).where(eq(contestSupportSubjects.contestId, contest.id));
    const [notice] = await db.select({ subjects: contestNoticeDocuments.subjects }).from(contestNoticeDocuments).where(eq(contestNoticeDocuments.contestId, contest.id)).limit(1);
    const subjects = uniqueSubjects(selectedSubjects.map(({ name }) => name), notice?.subjects ?? [], await syllabusSubjectsForContest(contest.name), await knownSubjectsForContest(contest.name));
    if (!subjects.length) throw new Error("Plano sem matérias");

    await db.insert(studyTasks).values(initialTasks(subjects, contest.dailyStudyMinutes).map((task) => ({ id: ulid(), contestId: contest.id, ...task })));
    await db.update(planGenerationJobs).set({ status: "COMPLETED" }).where(eq(planGenerationJobs.id, job.id));

    const [user] = await db.select({ phone: users.phone, socialName: users.socialName, name: users.name }).from(users).where(eq(users.id, contest.userId)).limit(1);
    if (user && whatsAppService.isConfigured) await whatsAppService.sendText(user.phone, planReadyMessage(user.socialName ?? user.name, contest.name));
    logger.info({ jobId: job.id, contestId: job.contestId, subjects: subjects.length, tasks: subjects.length * 20 }, "plano gerado com sucesso");
  } catch (error) {
    logger.error({ err: error, jobId: job.id, contestId: job.contestId, attempt: attempt + 1 }, "falha ao gerar plano");
    await db.update(planGenerationJobs).set({ status: attempt < 2 ? "QUEUED" : "FAILED" }).where(eq(planGenerationJobs.id, job.id));
    throw error;
  }

}

async function enqueuePendingPlanJobs() {
  const jobs = await db.select({ id: planGenerationJobs.id }).from(planGenerationJobs).where(eq(planGenerationJobs.status, "QUEUED"));
  await Promise.all(jobs.map(({ id }) => enqueuePlanGeneration(id)));
  logger.debug({ jobs: jobs.length }, "jobs de planos sincronizados com o broker");
}

if (import.meta.main) {
  await enqueuePendingPlanJobs();
  const worker = createWorker<{ jobId: string }>(queueNames.plans, async (job: Job<{ jobId: string }>) => processPlanJob(job.data.jobId, job.attemptsMade));
  worker.on("error", (error) => logger.error({ err: error }, "erro de conexão do worker"));
  worker.on("completed", (job) => logger.debug({ jobId: job.data.jobId }, "job de plano finalizado"));
  logger.info("worker online · aguardando planos");
}
