import { jwt } from "@elysiajs/jwt";
import { Elysia, status } from "elysia";
import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../database";
import { users } from "../database/tables/users.table";

export async function userIdFrom(authorization: string | undefined, verify: (token: string) => Promise<unknown>) {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const payload = token && await verify(token);
  return typeof payload === "object" && payload && "sub" in payload && typeof payload.sub === "string" ? payload.sub : undefined;
}

async function authenticatedUser(authorization: string | undefined, verify: (token: string) => Promise<unknown>) {
  const userId = await userIdFrom(authorization, verify);
  if (!userId) return;
  const [user] = await db.select({ id: users.id, premium: users.premium }).from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

export const accessControl = new Elysia({ name: "access-control" })
  .use(jwt({ name: "jwt", secret: env.JWT_SECRET }))
  .macro({
    auth: {
      async beforeHandle({ headers, jwt }) {
        const user = await authenticatedUser(headers.authorization, jwt.verify);
        if (!user) return status(401, { message: "Token inválido ou ausente" });
      },
    },
    premium: {
      async beforeHandle({ headers, jwt }) {
        const user = await authenticatedUser(headers.authorization, jwt.verify);
        if (!user) return status(401, { message: "Token inválido ou ausente" });
        if (!user.premium) return status(403, { message: "Este recurso requer o plano Pro." });
      },
    },
  });
