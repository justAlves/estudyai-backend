import { and, asc, count, eq, gte, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import { ulid } from "ulid";
import { z } from "zod";
import { db } from "../../../database";
import { contestNoticeDocuments } from "../../../database/tables/contest-notice-documents.table";
import { contestSupportSubjects } from "../../../database/tables/contest-support-subjects.table";
import { contests } from "../../../database/tables/contests.table";
import { simulationAnswers } from "../../../database/tables/simulation-answers.table";
import { simulationGenerationJobs } from "../../../database/tables/simulation-generation-jobs.table";
import { simulationQuestions } from "../../../database/tables/simulation-questions.table";
import { simulations } from "../../../database/tables/simulations.table";
import { studyAssessments } from "../../../database/tables/study-assessments.table";
import { users } from "../../../database/tables/users.table";
import { accessControl, userIdFrom } from "../../../plugins/access-control";
import { enqueueSimulationGeneration } from "../../../queues";
import { canConsumeMonthlyUsage, monthlyLimits } from "../../billing/services/usage-limits";
import { knownSubjectsForContest, uniqueSubjects } from "../../onboarding/services/known-contests.service";
import { syllabusSubjectsForContest } from "../../onboarding/services/contest-syllabus.service";
import { adaptPlan } from "../../study/services/adaptive-plan.service";

const simulationBody = z.object({
  contestId: z.string().min(1),
  quantity: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)]),
  subjects: z.array(z.string().trim().min(2).max(120)).min(1).max(100),
});

const answerBody = z.object({ selectedOption: z.number().int().min(0).max(3) });

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function contestSubjects(contestId: string, contestName: string) {
  const [support, notice, syllabus, known] = await Promise.all([
    db.select({ name: contestSupportSubjects.name }).from(contestSupportSubjects).where(eq(contestSupportSubjects.contestId, contestId)),
    db.select({ subjects: contestNoticeDocuments.subjects }).from(contestNoticeDocuments).where(eq(contestNoticeDocuments.contestId, contestId)).limit(1),
    syllabusSubjectsForContest(contestName),
    knownSubjectsForContest(contestName),
  ]);
  return uniqueSubjects(support.map(({ name }) => name), notice[0]?.subjects ?? [], syllabus, known);
}

function publicQuestion(question: typeof simulationQuestions.$inferSelect, answer?: typeof simulationAnswers.$inferSelect, reveal = false) {
  return {
    id: question.id,
    position: question.position,
    subject: question.subject,
    statement: question.statement,
    options: question.options,
    difficulty: question.difficulty,
    selectedOption: answer?.selectedOption ?? null,
    ...(reveal ? { correctOption: question.correctOption, explanation: question.explanation, correct: answer?.selectedOption === question.correctOption } : {}),
  };
}

async function ownedSimulation(simulationId: string, userId: string) {
  const [simulation] = await db.select({ simulation: simulations, contest: contests }).from(simulations).innerJoin(contests, eq(simulations.contestId, contests.id)).where(and(eq(simulations.id, simulationId), eq(contests.userId, userId))).limit(1);
  return simulation;
}

export const simulationsController = new Elysia({ prefix: "/simulations", tags: ["Simulations"] })
  .use(accessControl)
  .get("/options", async ({ headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const [contest] = userId ? await db.select({ id: contests.id, name: contests.name, examiningBoard: contests.examiningBoard }).from(contests).where(and(eq(contests.userId, userId), eq(contests.isActive, true))).limit(1) : [];
    if (!contest) { set.status = 404; return { message: "Concurso ativo não encontrado." }; }
    const subjects = await contestSubjects(contest.id, contest.name);
    const [user] = await db.select({ premium: users.premium }).from(users).where(eq(users.id, userId!)).limit(1);
    const [usage] = await db.select({ used: count() }).from(simulations).innerJoin(contests, eq(simulations.contestId, contests.id)).where(and(eq(contests.userId, userId!), gte(simulations.createdAt, monthStart()), ne(simulations.status, "FAILED")));
    const limit = monthlyLimits[user?.premium ? "PRO" : "FREE"].SIMULATION;
    return { contest, subjects, quantities: [5, 10, 20, 30], usage: { used: Number(usage?.used ?? 0), limit, remaining: Math.max(0, limit - Number(usage?.used ?? 0)) } };
  }, { auth: true, detail: { summary: "Consulta as opções e a cota mensal de simulados" } })
  .get("/", async ({ headers, jwt }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const rows = await db.select({ simulation: simulations, contestName: contests.name }).from(simulations).innerJoin(contests, eq(simulations.contestId, contests.id)).where(eq(contests.userId, userId!)).orderBy(asc(simulations.createdAt));
    return rows.map(({ simulation, contestName }) => ({ ...simulation, contestName }));
  }, { auth: true, detail: { summary: "Lista os simulados do estudante" } })
  .post("/", async ({ body, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const [contest] = await db.select({ id: contests.id, name: contests.name, examiningBoard: contests.examiningBoard }).from(contests).where(and(eq(contests.id, body.contestId), eq(contests.userId, userId!))).limit(1);
    if (!contest) { set.status = 404; return { message: "Concurso não encontrado." }; }
    const [user] = await db.select({ premium: users.premium }).from(users).where(eq(users.id, userId!)).limit(1);
    const [usage] = await db.select({ used: count() }).from(simulations).innerJoin(contests, eq(simulations.contestId, contests.id)).where(and(eq(contests.userId, userId!), gte(simulations.createdAt, monthStart()), ne(simulations.status, "FAILED")));
    const plan = user?.premium ? "PRO" : "FREE";
    const used = Number(usage?.used ?? 0);
    if (!canConsumeMonthlyUsage(plan, "SIMULATION", used)) { set.status = 429; return { message: `Você atingiu o limite de ${monthlyLimits[plan].SIMULATION} simulados deste mês.`, used, limit: monthlyLimits[plan].SIMULATION }; }

    const availableSubjects = await contestSubjects(contest.id, contest.name);
    const selectedSubjects = uniqueSubjects(body.subjects).filter((subject) => availableSubjects.some((available) => available.toLocaleLowerCase() === subject.toLocaleLowerCase()));
    if (!selectedSubjects.length) { set.status = 422; return { message: "Selecione ao menos uma matéria válida do concurso.", subjects: availableSubjects }; }
    const simulationId = ulid();
    const jobId = ulid();
    await db.transaction(async (tx) => {
      await tx.insert(simulations).values({ id: simulationId, contestId: contest.id, questionCount: body.quantity, subjects: selectedSubjects });
      await tx.insert(simulationGenerationJobs).values({ id: jobId, simulationId });
    });
    try {
      await enqueueSimulationGeneration(jobId);
    } catch (error) {
      await db.update(simulations).set({ status: "FAILED" }).where(eq(simulations.id, simulationId));
      set.status = 503;
      return { message: "O gerador de simulados está temporariamente indisponível." };
    }
    set.status = 202;
    return { id: simulationId, status: "QUEUED", questionCount: body.quantity, subjects: selectedSubjects };
  }, { auth: true, body: simulationBody, detail: { summary: "Cria um simulado e agenda sua geração" } })
  .get("/:simulationId", async ({ params, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const owned = await ownedSimulation(params.simulationId, userId!);
    if (!owned) { set.status = 404; return { message: "Simulado não encontrado." }; }
    const questions = await db.select().from(simulationQuestions).where(eq(simulationQuestions.simulationId, params.simulationId)).orderBy(asc(simulationQuestions.position));
    const answers = await db.select().from(simulationAnswers).where(eq(simulationAnswers.simulationId, params.simulationId));
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    const reveal = owned.simulation.status === "FINISHED";
    return { ...owned.simulation, contest: { id: owned.contest.id, name: owned.contest.name, examiningBoard: owned.contest.examiningBoard }, questions: questions.map((question) => publicQuestion(question, answerByQuestion.get(question.id), reveal)) };
  }, { auth: true, detail: { summary: "Consulta um simulado sem expor o gabarito antes da finalização" } })
  .put("/:simulationId/answers/:questionId", async ({ params, body, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const owned = await ownedSimulation(params.simulationId, userId!);
    if (!owned) { set.status = 404; return { message: "Simulado não encontrado." }; }
    if (owned.simulation.status !== "COMPLETED") { set.status = 409; return { message: "Este simulado ainda não está pronto para ser respondido." }; }
    const [question] = await db.select({ id: simulationQuestions.id, options: simulationQuestions.options }).from(simulationQuestions).where(and(eq(simulationQuestions.id, params.questionId), eq(simulationQuestions.simulationId, params.simulationId))).limit(1);
    if (!question || body.selectedOption >= question.options.length) { set.status = 422; return { message: "Questão ou alternativa inválida." }; }
    await db.insert(simulationAnswers).values({ id: ulid(), simulationId: params.simulationId, questionId: question.id, selectedOption: body.selectedOption }).onConflictDoUpdate({ target: [simulationAnswers.simulationId, simulationAnswers.questionId], set: { selectedOption: body.selectedOption, answeredAt: new Date() } });
    return { saved: true };
  }, { auth: true, body: answerBody, detail: { summary: "Salva uma resposta do simulado" } })
  .post("/:simulationId/finish", async ({ params, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    const owned = await ownedSimulation(params.simulationId, userId!);
    if (!owned) { set.status = 404; return { message: "Simulado não encontrado." }; }
    if (owned.simulation.status === "FINISHED") return { status: "FINISHED", score: owned.simulation.score, total: owned.simulation.questionCount };
    if (owned.simulation.status !== "COMPLETED") { set.status = 409; return { message: "Este simulado ainda está sendo preparado." }; }
    const questions = await db.select().from(simulationQuestions).where(eq(simulationQuestions.simulationId, params.simulationId)).orderBy(asc(simulationQuestions.position));
    const answers = await db.select().from(simulationAnswers).where(eq(simulationAnswers.simulationId, params.simulationId));
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    const score = questions.filter((question) => answerByQuestion.get(question.id)?.selectedOption === question.correctOption).length;
    await db.transaction(async (tx) => {
      await tx.update(simulations).set({ status: "FINISHED", score, finishedAt: new Date() }).where(and(eq(simulations.id, params.simulationId), eq(simulations.status, "COMPLETED")));
      const [user] = await tx.select({ premium: users.premium }).from(users).where(eq(users.id, userId!)).limit(1);
      if (user?.premium) {
        for (const subject of owned.simulation.subjects) {
          const subjectQuestions = questions.filter((question) => question.subject === subject);
          if (subjectQuestions.length) {
            const subjectScore = subjectQuestions.filter((question) => answerByQuestion.get(question.id)?.selectedOption === question.correctOption).length;
            await tx.insert(studyAssessments).values({ id: ulid(), contestId: owned.contest.id, subject, type: "SIMULATION", score: subjectScore, total: subjectQuestions.length });
          }
        }
      }
    });
    if (userId) await adaptPlan(owned.contest.id);
    return { status: "FINISHED", score, total: questions.length, questions: questions.map((question) => publicQuestion(question, answerByQuestion.get(question.id), true)) };
  }, { auth: true, detail: { summary: "Finaliza e corrige um simulado" } });
