import { and, asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "../database";
import { contestSupportSubjects } from "../database/tables/contest-support-subjects.table";
import { contests } from "../database/tables/contests.table";
import { planGenerationJobs } from "../database/tables/plan-generation-jobs.table";
import { studyTasks } from "../database/tables/study-tasks.table";
import { users } from "../database/tables/users.table";
import { knownSubjectsForContest, uniqueSubjects } from "../modules/onboarding/services/known-contests.service";
import { syllabusSubjectsForContest } from "../modules/onboarding/services/contest-syllabus.service";
import { planReadyMessage, whatsAppService } from "../modules/notifications/services/whatsapp.service";
import { workerLogger } from "../config/logger";

const logger = workerLogger("plans");

type TaskType = "STUDY" | "QUESTIONS" | "REVIEW";

export function initialTasks(subjects: string[], minutes: number, from = new Date()) {
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

async function processNextJob() {
  const [queued] = await db.select().from(planGenerationJobs).where(eq(planGenerationJobs.status, "QUEUED")).orderBy(asc(planGenerationJobs.createdAt)).limit(1);
  if (!queued) return false;

  const [job] = await db.update(planGenerationJobs).set({ status: "PROCESSING" }).where(and(eq(planGenerationJobs.id, queued.id), eq(planGenerationJobs.status, "QUEUED"))).returning();
  if (!job) return true;
  logger.info({ jobId: job.id, contestId: job.contestId }, "gerando plano inicial");

  try {
    const [contest] = await db.select().from(contests).where(eq(contests.id, job.contestId)).limit(1);
    if (!contest) throw new Error("Plano não encontrado");
    const selectedSubjects = await db.select().from(contestSupportSubjects).where(eq(contestSupportSubjects.contestId, contest.id));
    const subjects = uniqueSubjects(selectedSubjects.map(({ name }) => name), await syllabusSubjectsForContest(contest.name), await knownSubjectsForContest(contest.name));
    if (!subjects.length) throw new Error("Plano sem matérias");

    await db.insert(studyTasks).values(initialTasks(subjects, contest.dailyStudyMinutes).map((task) => ({ id: ulid(), contestId: contest.id, ...task })));
    await db.update(planGenerationJobs).set({ status: "COMPLETED" }).where(eq(planGenerationJobs.id, job.id));

    const [user] = await db.select({ phone: users.phone, socialName: users.socialName, name: users.name }).from(users).where(eq(users.id, contest.userId)).limit(1);
    if (user && whatsAppService.isConfigured) await whatsAppService.sendText(user.phone, planReadyMessage(user.socialName ?? user.name, contest.name));
    logger.info({ jobId: job.id, contestId: job.contestId, tasks: subjects.length * 20 }, "plano inicial concluído");
  } catch (error) {
    logger.error({ err: error, jobId: job.id, contestId: job.contestId }, "falha ao gerar plano inicial");
    await db.update(planGenerationJobs).set({ status: "FAILED" }).where(eq(planGenerationJobs.id, job.id));
  }

  return true;
}

if (import.meta.main) {
  logger.info("worker iniciado; aguardando planos");
  while (true) {
    await processNextJob();
    await Bun.sleep(2_000);
  }
}
