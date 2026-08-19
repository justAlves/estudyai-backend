import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { env } from "../../../config/env";
import { searchQuestions } from "../services/rag.service";

const authenticated = async (authorization: string | undefined, verify: (token: string) => Promise<unknown>) => {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const payload = token && await verify(token);
  return typeof payload === "object" && payload && "sub" in payload && typeof payload.sub === "string";
};

export const ragController = new Elysia({ prefix: "/rag", tags: ["RAG"] })
  .use(jwt({ name: "jwt", secret: env.JWT_SECRET }))
  .get("/questions/search", async ({ query, headers, jwt, set }) => {
    if (!await authenticated(headers.authorization, jwt.verify)) {
      set.status = 401;
      return { message: "Token inválido ou ausente" };
    }
    if (!query.q?.trim() || query.q.length > 1_000) {
      set.status = 400;
      return { message: "Informe uma busca de até 1.000 caracteres." };
    }

    return searchQuestions(query.q.trim());
  }, { detail: { summary: "Busca questões semelhantes no RAG" } });
