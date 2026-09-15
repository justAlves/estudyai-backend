import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "../../../database";
import { contests } from "../../../database/tables/contests.table";
import { studyActivityAttempts } from "../../../database/tables/study-activity-attempts.table";
import { studyAssessments } from "../../../database/tables/study-assessments.table";
import { studyMaterials } from "../../../database/tables/study-materials.table";
import { studyTasks } from "../../../database/tables/study-tasks.table";
import { users } from "../../../database/tables/users.table";
import { emailService } from "../../notifications/services/email.service";
import { apiLogger } from "../../../config/logger";

type Result = { subject: string; score: number; total: number };

export function adaptiveResultsWithinPlan(planSubjects: string[], results: Result[]) {
  const allowed = new Set(planSubjects);
  return results.filter(({ subject }) => allowed.has(subject));
}

export function weakSubjects(results: Result[]) {
  const totals = new Map<string, { score: number; total: number }>();
  for (const result of results) {
    const current = totals.get(result.subject) ?? { score: 0, total: 0 };
    totals.set(result.subject, { score: current.score + result.score, total: current.total + result.total });
  }
  return [...totals].sort(([, left], [, right]) => left.score / left.total - right.score / right.total).map(([subject]) => subject);
}

export async function adaptPlan(contestId: string) {
  const [contest] = await db.select({ premium: users.premium, email: users.email, socialName: users.socialName, name: users.name }).from(contests).innerJoin(users, eq(contests.userId, users.id)).where(eq(contests.id, contestId)).limit(1);
  if (!contest?.premium) return [];
  const planRows = await db.select({ subject: studyTasks.subject }).from(studyTasks).where(eq(studyTasks.contestId, contestId));
  const planSubjects = [...new Set(planRows.map(({ subject }) => subject))];
  if (!planSubjects.length) return [];
  const activities = await db.select({ subject: studyTasks.subject, score: studyActivityAttempts.score, activities: studyMaterials.activities }).from(studyActivityAttempts).innerJoin(studyTasks, eq(studyActivityAttempts.taskId, studyTasks.id)).innerJoin(studyMaterials, eq(studyMaterials.taskId, studyTasks.id)).where(eq(studyTasks.contestId, contestId));
  const assessments = await db.select({ subject: studyAssessments.subject, score: studyAssessments.score, total: studyAssessments.total }).from(studyAssessments).where(eq(studyAssessments.contestId, contestId));
  const results = adaptiveResultsWithinPlan(
    planSubjects,
    [...activities.map(({ subject, score, activities }) => ({ subject, score, total: activities.length })), ...assessments],
  );
  const subjects = weakSubjects(results);
  if (!subjects.length) return [];
  const pending = await db.select({ id: studyTasks.id, type: studyTasks.type }).from(studyTasks).leftJoin(studyMaterials, eq(studyMaterials.taskId, studyTasks.id)).where(and(eq(studyTasks.contestId, contestId), eq(studyTasks.status, "PENDING"), gte(studyTasks.scheduledFor, new Date().toISOString().slice(0, 10)), isNull(studyMaterials.id))).limit(6);
  await Promise.all(pending.map((task, index) => {
    const subject = subjects[index % subjects.length];
    const title = task.type === "QUESTIONS" ? `Resolver questões de ${subject}` : task.type === "REVIEW" ? `Revisar ${subject}` : `Estudar ${subject}`;
    return db.update(studyTasks).set({ subject, title }).where(eq(studyTasks.id, task.id));
  }));
  const next = pending[0];
  if (next && emailService.isConfigured) {
    try { await emailService.sendAdaptivePlan({ to: contest.email, name: contest.socialName ?? contest.name, subject: subjects[0], taskId: next.id }); }
    catch (error) { apiLogger.warn({ err: error, contestId, taskId: next.id }, "não foi possível enviar o e-mail do plano adaptativo"); }
  }
  return pending.map((task, index) => ({ id: task.id, subject: subjects[index % subjects.length], type: task.type }));
}
