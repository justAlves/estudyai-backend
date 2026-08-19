import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { ulid } from "ulid";
import { z } from "zod";
import { db } from "../../../database";
import { contests } from "../../../database/tables/contests.table";
import { materialGenerationJobs } from "../../../database/tables/material-generation-jobs.table";
import { studyMaterials } from "../../../database/tables/study-materials.table";
import { studyActivityAttempts } from "../../../database/tables/study-activity-attempts.table";
import { studyTasks } from "../../../database/tables/study-tasks.table";
import { accessControl, userIdFrom } from "../../../plugins/access-control";
import { activityScore } from "../services/material.service";
import { nextAvailableStudyDay } from "../services/task-scheduling.service";

async function ownedTask(taskId: string, userId: string) {
  const [task] = await db.select({ id: studyTasks.id, contestId: studyTasks.contestId, estimatedMinutes: studyTasks.estimatedMinutes, scheduledFor: studyTasks.scheduledFor, status: studyTasks.status, dailyStudyMinutes: contests.dailyStudyMinutes }).from(studyTasks).innerJoin(contests, eq(studyTasks.contestId, contests.id)).where(and(eq(studyTasks.id, taskId), eq(contests.userId, userId))).limit(1);
  return task;
}

export const studyController = new Elysia({ prefix: "/study-tasks", tags: ["Study"] })
  .use(accessControl)
  .post("/:taskId/material", async ({ params, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId || !await ownedTask(params.taskId, userId)) {
      set.status = 404;
      return { message: "Tarefa não encontrada." };
    }
    const [material] = await db.select({ id: studyMaterials.id }).from(studyMaterials).where(eq(studyMaterials.taskId, params.taskId)).limit(1);
    if (material) return { status: "COMPLETED" };

    await db.insert(materialGenerationJobs).values({ id: ulid(), taskId: params.taskId }).onConflictDoUpdate({
      target: materialGenerationJobs.taskId,
      set: { status: "QUEUED", attemptCount: 0, nextAttemptAt: null, updatedAt: new Date() },
      where: eq(materialGenerationJobs.status, "FAILED"),
    });
    set.status = 202;
    return { status: "QUEUED" };
  }, { auth: true, detail: { summary: "Solicita o material de uma tarefa" } })
  .get("/:taskId/material", async ({ params, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId || !await ownedTask(params.taskId, userId)) {
      set.status = 404;
      return { message: "Tarefa não encontrada." };
    }
    const [material] = await db.select().from(studyMaterials).where(eq(studyMaterials.taskId, params.taskId)).limit(1);
    if (material) {
      const [attempt] = await db.select().from(studyActivityAttempts).where(eq(studyActivityAttempts.taskId, params.taskId)).limit(1);
      return {
        status: "COMPLETED",
        material: { ...material, activities: material.activities.map(({ answer: _, explanation: __, ...activity }) => activity) },
        attempt: attempt && { answers: attempt.answers, score: attempt.score, total: material.activities.length, feedback: material.activities.map((activity, index) => ({ index, answer: activity.answer, explanation: activity.explanation })) },
      };
    }
    const [job] = await db.select({ status: materialGenerationJobs.status }).from(materialGenerationJobs).where(eq(materialGenerationJobs.taskId, params.taskId)).limit(1);
    return { status: job?.status ?? "IDLE" };
  }, { auth: true, detail: { summary: "Consulta o material de uma tarefa" } })
  .post("/:taskId/activities", async ({ body, params, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId || !await ownedTask(params.taskId, userId)) {
      set.status = 404;
      return { message: "Tarefa não encontrada." };
    }
    const [material] = await db.select({ activities: studyMaterials.activities }).from(studyMaterials).where(eq(studyMaterials.taskId, params.taskId)).limit(1);
    if (!material || !material.activities.length || body.answers.length !== material.activities.length || body.answers.some((answer, index) => answer < 0 || answer >= material.activities[index].options.length)) {
      set.status = 422;
      return { message: "Respostas inválidas para esta atividade." };
    }
    const score = activityScore(material.activities, body.answers);
    await db.insert(studyActivityAttempts).values({ id: ulid(), taskId: params.taskId, answers: body.answers, score }).onConflictDoNothing();
    const [attempt] = await db.select().from(studyActivityAttempts).where(eq(studyActivityAttempts.taskId, params.taskId)).limit(1);
    return { answers: attempt!.answers, score: attempt!.score, total: material.activities.length, feedback: material.activities.map((activity, index) => ({ index, answer: activity.answer, explanation: activity.explanation })) };
  }, { auth: true, body: z.object({ answers: z.array(z.number().int()) }), detail: { summary: "Finaliza o bloco de questões" } })
  .patch("/:taskId", async ({ body, params, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const task = userId && await ownedTask(params.taskId, userId);
    if (!task) {
      set.status = 404;
      return { message: "Tarefa não encontrada." };
    }

    if (body.status === "COMPLETED") {
      await db.update(studyTasks).set({ status: "COMPLETED" }).where(eq(studyTasks.id, task.id));
      return { status: "COMPLETED", scheduledFor: task.scheduledFor };
    }

    const tasks = await db.select({ id: studyTasks.id, scheduledFor: studyTasks.scheduledFor, estimatedMinutes: studyTasks.estimatedMinutes, status: studyTasks.status }).from(studyTasks).where(eq(studyTasks.contestId, task.contestId));
    const scheduledFor = nextAvailableStudyDay(tasks, task, task.dailyStudyMinutes);
    await db.update(studyTasks).set({ status: "PENDING", scheduledFor }).where(eq(studyTasks.id, task.id));
    return { status: "PENDING", scheduledFor };
  }, { auth: true, body: z.object({ status: z.enum(["COMPLETED", "NOT_COMPLETED"]) }), detail: { summary: "Conclui ou reagenda uma tarefa" } });
