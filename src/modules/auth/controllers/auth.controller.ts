import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { env } from "../../../config/env";
import { forgotPasswordDto } from "../dtos/forgot-password.dto";
import { loginDto } from "../dtos/login.dto";
import { refreshTokenDto } from "../dtos/refresh-token.dto";
import { registerDto } from "../dtos/register.dto";
import { resetPasswordDto } from "../dtos/reset-password.dto";
import { verifyResetCodeDto } from "../dtos/verify-reset-code.dto";
import { AuthError, AuthService } from "../services/auth.service";
import { eq } from "drizzle-orm";
import { users } from "../../../database/tables/users.table";
import { refreshTokens } from "../../../database/tables/refresh-tokens.table";
import { userIdFrom } from "../../../plugins/access-control";
import { z } from "zod";
import { db } from "../../../database";

const authService = new AuthService();
const profileDto = z.object({ name: z.string().trim().min(2).max(120), socialName: z.string().trim().min(2).max(120), email: z.email() });
const passwordDto = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(72) });
const googleLoginDto = z.object({ credential: z.string().min(1) });

export const authController = new Elysia({ prefix: "/auth", tags: ["Auth"] })
  .use(jwt({ name: "jwt", secret: env.JWT_SECRET }))
  .post(
    "/verify-reset-code",
    async ({ body, set }) => {
      try {
        await authService.verifyResetCode(body);
        return { message: "Código válido." };
      } catch (error) {
        if (error instanceof AuthError) {
          set.status = error.status;
          return { message: error.message };
        }
        throw error;
      }
    },
    { body: verifyResetCodeDto, detail: { summary: "Valida o código de redefinição" } },
  )
  .post(
    "/forgot-password",
    async ({ body, set }) => {
      try {
        await authService.requestPasswordReset(body);
        return { message: "Se houver uma conta com este e-mail, enviaremos um código por e-mail." };
      } catch (error) {
        if (error instanceof AuthError) {
          set.status = error.status;
          return { message: error.message };
        }
        throw error;
      }
    },
    { body: forgotPasswordDto, detail: { summary: "Envia código para redefinição de senha" } },
  )
  .post(
    "/reset-password",
    async ({ body, set }) => {
      try {
        await authService.resetPassword(body);
        return { message: "Senha alterada com sucesso." };
      } catch (error) {
        if (error instanceof AuthError) {
          set.status = error.status;
          return { message: error.message };
        }
        throw error;
      }
    },
    { body: resetPasswordDto, detail: { summary: "Redefine a senha usando um código" } },
  )
  .post(
    "/register",
    async ({ body, jwt, set }) => {
      try {
        return await authService.register(body, (userId) =>
          jwt.sign({ sub: userId, exp: "15m", iat: true }),
        );
      } catch (error) {
        if (error instanceof AuthError) {
          set.status = error.status;
          return { message: error.message };
        }
        throw error;
      }
    },
    { body: registerDto, detail: { summary: "Cria uma conta" } },
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      try {
        return await authService.login(body, (userId) =>
          jwt.sign({ sub: userId, exp: "15m", iat: true }),
        );
      } catch (error) {
        if (error instanceof AuthError) {
          set.status = error.status;
          return { message: error.message };
        }
        throw error;
      }
    },
    { body: loginDto, detail: { summary: "Autentica uma conta" } },
  )
  .post(
    "/google",
    async ({ body, jwt, set }) => {
      try {
        return await authService.loginWithGoogle(body.credential, (userId) =>
          jwt.sign({ sub: userId, exp: "15m", iat: true }),
        );
      } catch (error) {
        if (error instanceof AuthError) {
          set.status = error.status;
          return { message: error.message };
        }
        throw error;
      }
    },
    { body: googleLoginDto, detail: { summary: "Cria uma conta usando Google" } },
  )
  .post(
    "/refresh",
    async ({ body, jwt, set }) => {
      try {
        return await authService.refresh(body, (userId) =>
          jwt.sign({ sub: userId, exp: "15m", iat: true }),
        );
      } catch (error) {
        if (error instanceof AuthError) {
          set.status = error.status;
          return { message: error.message };
        }
        throw error;
      }
    },
    { body: refreshTokenDto, detail: { summary: "Renova os tokens" } },
  )
  .get("/me", async ({ headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) { set.status = 401; return { message: "Token inválido ou ausente" }; }
    const [user] = await db.select({ id: users.id, name: users.name, socialName: users.socialName, email: users.email, premium: users.premium }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) { set.status = 401; return { message: "Usuário não encontrado" }; }
    return user;
  })
  .patch("/me", async ({ body, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) { set.status = 401; return { message: "Token inválido ou ausente" }; }
    try {
      const [user] = await db.update(users).set({ name: body.name, socialName: body.socialName, email: body.email.toLowerCase() }).where(eq(users.id, userId)).returning({ id: users.id, name: users.name, socialName: users.socialName, email: users.email, premium: users.premium });
      return user;
    } catch (error) {
      if (String(error).includes("users_email_unique")) { set.status = 409; return { message: "Este e-mail já está em uso." }; }
      throw error;
    }
  }, { body: profileDto })
  .patch("/password", async ({ body, headers, jwt, set }) => {
    const userId = await userIdFrom(headers.authorization, jwt.verify);
    if (!userId) { set.status = 401; return { message: "Token inválido ou ausente" }; }
    const [user] = await db.select({ password: users.password }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.password || !(await Bun.password.verify(body.currentPassword, user.password))) { set.status = 401; return { message: "A senha atual está incorreta." }; }
    await db.transaction(async (tx) => {
      await tx.update(users).set({ password: await Bun.password.hash(body.newPassword) }).where(eq(users.id, userId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    });
    return { changed: true };
  }, { body: passwordDto });
