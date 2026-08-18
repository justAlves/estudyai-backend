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

const authService = new AuthService();

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
        return { message: "Se houver uma conta com este e-mail, enviaremos um código pelo WhatsApp." };
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
  );
