import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { asc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { env } from "../../../config/env";
import { db } from "../../../database";
import { contestSupportSubjects } from "../../../database/tables/contest-support-subjects.table";
import { contests } from "../../../database/tables/contests.table";
import { createContestDto } from "../dtos/create-contest.dto";

const userIdFrom = async (authorization: string | undefined, verify: (token: string) => Promise<unknown>) => {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const payload = token && await verify(token);
  return typeof payload === "object" && payload && "sub" in payload && typeof payload.sub === "string"
    ? payload.sub
    : undefined;
};

export const onboardingController = new Elysia({ prefix: "/onboarding", tags: ["Onboarding"] })
  .use(jwt({ name: "jwt", secret: env.JWT_SECRET }))
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
