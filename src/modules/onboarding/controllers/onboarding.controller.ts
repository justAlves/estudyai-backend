import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { and, asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { env } from "../../../config/env";
import { db } from "../../../database";
import { contestSupportSubjects } from "../../../database/tables/contest-support-subjects.table";
import { contests } from "../../../database/tables/contests.table";
import { createContestDto, saveOnboardingDto } from "../dtos/create-contest.dto";
import { users } from "../../../database/tables/users.table";
import { planGenerationJobs } from "../../../database/tables/plan-generation-jobs.table";
import { studyTasks } from "../../../database/tables/study-tasks.table";

const userIdFrom = async (authorization: string | undefined, verify: (token: string) => Promise<unknown>) => {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const payload = token && await verify(token);
  return typeof payload === "object" && payload && "sub" in payload && typeof payload.sub === "string"
    ? payload.sub
    : undefined;
};

export const onboardingController = new Elysia({ prefix: "/onboarding", tags: ["Onboarding"] })
  .use(jwt({ name: "jwt", secret: env.JWT_SECRET }))
  .get("/status", async ({ headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) {
      set.status = 401;
      return { message: "Token inválido ou ausente" };
    }

    const [user] = await db
      .select({ socialName: users.socialName, completedAt: users.onboardingCompletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return { completed: !!user?.completedAt, socialName: user?.socialName ?? "" };
  })
  .get("/plan", async ({ headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) {
      set.status = 401;
      return { message: "Token inválido ou ausente" };
    }

    const [contest] = await db.select({ id: contests.id, name: contests.name, examDate: contests.examDate, dailyStudyMinutes: contests.dailyStudyMinutes }).from(contests).where(and(eq(contests.userId, userId), eq(contests.isActive, true))).limit(1);
    if (!contest) return null;
    const [job] = await db.select({ status: planGenerationJobs.status }).from(planGenerationJobs).where(eq(planGenerationJobs.contestId, contest.id)).limit(1);
    const tasks = await db.select({ id: studyTasks.id, subject: studyTasks.subject, title: studyTasks.title, type: studyTasks.type, estimatedMinutes: studyTasks.estimatedMinutes, status: studyTasks.status, scheduledFor: studyTasks.scheduledFor }).from(studyTasks).where(eq(studyTasks.contestId, contest.id)).orderBy(asc(studyTasks.scheduledFor));
    return { name: contest.name, examDate: contest.examDate, dailyStudyMinutes: contest.dailyStudyMinutes, status: job?.status ?? "QUEUED", tasks };
  })
  .post(
    "/",
    async ({ body, headers, jwt, set }) => {
      const userId = await userIdFrom(headers.authorization, jwt.verify);
      if (!userId) {
        set.status = 401;
        return { message: "Token inválido ou ausente" };
      }

      await db.transaction(async (tx) => {
        await tx.update(users).set({
          socialName: body.socialName,
          onboardingPreferences: body,
          ...(body.complete ? { onboardingCompletedAt: new Date() } : {}),
        }).where(eq(users.id, userId));

        if (!body.complete) return;

        const { socialName: _, plan: __, complete: ___, supportSubjects, ...contestInput } = body;
        await tx.update(contests).set({ isActive: false }).where(eq(contests.userId, userId));
        const [contest] = await tx.insert(contests).values({ id: ulid(), userId, ...contestInput }).returning();
        await tx.insert(contestSupportSubjects).values(supportSubjects.map((name) => ({ id: ulid(), contestId: contest.id, name })));
        await tx.insert(planGenerationJobs).values({ id: ulid(), contestId: contest.id });
      });

      set.status = 201;
      return { completed: body.complete };
    },
    { body: saveOnboardingDto, detail: { summary: "Salva as preferências do onboarding" } },
  )
  .post(
    "/contests",
    async ({ body, headers, jwt, set }) => {
      const userId = await userIdFrom(headers.authorization, jwt.verify);
      if (!userId) {
        set.status = 401;
        return { message: "Token inválido ou ausente" };
      }

      const contest = await db.transaction(async (tx) => {
        const { supportSubjects, ...contestInput } = body;
        const [contest] = await tx
          .insert(contests)
          .values({ id: ulid(), userId, ...contestInput })
          .returning();

        await tx.insert(contestSupportSubjects).values(
          supportSubjects.map((name) => ({ id: ulid(), contestId: contest.id, name })),
        );

        return contest;
      });

      set.status = 201;
      return contest;
    },
    { body: createContestDto, detail: { summary: "Registra um concurso do onboarding" } },
  )
  .get("/contests", async ({ headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) {
      set.status = 401;
      return { message: "Token inválido ou ausente" };
    }

    return db.query.contests.findMany({
      where: eq(contests.userId, userId),
      orderBy: asc(contests.examDate),
      with: { supportSubjects: true },
    });
  });
