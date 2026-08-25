import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { and, asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { env } from "../../../config/env";
import { db } from "../../../database";
import { contestSupportSubjects } from "../../../database/tables/contest-support-subjects.table";
import { contests } from "../../../database/tables/contests.table";
import { knownContests } from "../../../database/tables/known-contests.table";
import { createContestDto, saveOnboardingDto } from "../dtos/create-contest.dto";
import { searchContestCandidates } from "../services/contest-subjects.service";
import { users } from "../../../database/tables/users.table";
import { planGenerationJobs } from "../../../database/tables/plan-generation-jobs.table";
import { studyTasks } from "../../../database/tables/study-tasks.table";
import { contestNoticeDocuments } from "../../../database/tables/contest-notice-documents.table";
import { ragSyllabusChunks } from "../../../database/tables/rag-syllabus-chunks.table";
import { matchingSyllabusKey } from "../services/contest-syllabus.service";
import { noticeStorageConfigured, uploadNotice } from "../services/notice-storage.service";
import { extractNoticeText } from "../services/notice-text.service";
import { extractNoticeSubjects } from "../services/notice-subjects.service";
import { indexNoticeInGlobalRag } from "../services/notice-rag.service";
import { enqueuePlanGeneration } from "../../../queues";

const userIdFrom = async (authorization: string | undefined, verify: (token: string) => Promise<unknown>) => {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const payload = token && await verify(token);
  return typeof payload === "object" && payload && "sub" in payload && typeof payload.sub === "string"
    ? payload.sub
    : undefined;
};

export const onboardingController = new Elysia({ prefix: "/onboarding", tags: ["Onboarding"] })
  .use(jwt({ name: "jwt", secret: env.JWT_SECRET }))
  .get("/search", async ({ query }) => {
    const [known, syllabus] = await Promise.all([
      db.select({ name: knownContests.name, examiningBoard: knownContests.examiningBoard }).from(knownContests),
      db.selectDistinct({ name: ragSyllabusChunks.contestName }).from(ragSyllabusChunks),
    ]);
    return searchContestCandidates(query.q, [...known, ...syllabus]).map(({ name, examiningBoard }) => ({ name, examiningBoard: examiningBoard ?? null }));
  }, { query: z.object({ q: z.string().trim().min(2).max(160) }) })
  .get("/context", async ({ query }) => {
    const candidates = await db.selectDistinct({ key: ragSyllabusChunks.normalizedContestName, name: ragSyllabusChunks.contestName }).from(ragSyllabusChunks);
    const key = matchingSyllabusKey(query.name, candidates);
    const exact = key === query.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return { found: !!key, exact, related: !!key && !exact, relatedName: key && !exact ? candidates.find((candidate) => candidate.key === key)?.name ?? null : null };
  }, { query: z.object({ name: z.string().trim().min(2).max(160) }) })
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
    const tasks = job?.status === "COMPLETED"
      ? await db.select({ id: studyTasks.id, subject: studyTasks.subject, title: studyTasks.title, type: studyTasks.type, estimatedMinutes: studyTasks.estimatedMinutes, status: studyTasks.status, scheduledFor: studyTasks.scheduledFor }).from(studyTasks).where(eq(studyTasks.contestId, contest.id)).orderBy(asc(studyTasks.scheduledFor))
      : [];
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

      let planJobId = "";
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
        planJobId = ulid();
        await tx.insert(planGenerationJobs).values({ id: planJobId, contestId: contest.id });
      });
      await enqueuePlanGeneration(planJobId);

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
  .post("/notice", async ({ request, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) {
      set.status = 401;
      return { message: "Token inválido ou ausente" };
    }

    const form = await request.formData();
    const file = form.get("file");
    const contestName = String(form.get("contestName") ?? "").trim();
    if (!(file instanceof File) || file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      set.status = 422;
      return { message: "Envie um arquivo PDF do edital." };
    }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      set.status = 422;
      return { message: "O edital precisa ter entre 1 byte e 20 MB." };
    }
    if (!noticeStorageConfigured()) {
      set.status = 503;
      return { message: "O recebimento de editais está sendo preparado. Tente novamente em instantes." };
    }

    const [contest] = await db.select({ id: contests.id }).from(contests).where(and(eq(contests.userId, userId), eq(contests.name, contestName), eq(contests.isActive, true))).limit(1);
    if (!contest) {
      set.status = 404;
      return { message: "Concurso ativo não encontrado." };
    }

    const storageKey = `users/${userId}/contests/${contest.id}/notice-${Date.now()}.pdf`;
    let extractedText: string;
    try {
      extractedText = await extractNoticeText(file);
    } catch (error) {
      set.status = 422;
      return { message: error instanceof Error ? error.message : "Não foi possível ler o edital." };
    }
    const subjects = await extractNoticeSubjects(contestName, extractedText);
    await uploadNotice(storageKey, file);
    await db.insert(contestNoticeDocuments).values({ id: ulid(), contestId: contest.id, originalName: file.name.slice(0, 255), mimeType: file.type, storageKey, status: "COMPLETED", extractedText, subjects }).onConflictDoUpdate({
      target: contestNoticeDocuments.contestId,
      set: { originalName: file.name.slice(0, 255), mimeType: file.type, storageKey, status: "COMPLETED", extractedText, subjects, errorMessage: null, updatedAt: new Date() },
    });
    try {
      const indexed = await indexNoticeInGlobalRag(contestName, extractedText, subjects);
      console.info({ contestName, ...indexed }, "edital indexado no RAG global");
    } catch (error) {
      console.warn({ err: error, contestName }, "não foi possível indexar o edital no RAG global");
    }
    await db.delete(studyTasks).where(eq(studyTasks.contestId, contest.id));
    const [planJob] = await db.update(planGenerationJobs).set({ status: "QUEUED" }).where(eq(planGenerationJobs.contestId, contest.id)).returning({ id: planGenerationJobs.id });
    if (planJob) await enqueuePlanGeneration(planJob.id);
    set.status = 202;
    return { status: "RECEIVED", message: "Seu edital foi recebido e será usado para preparar seu plano." };
  }, { parse: "none" })
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
