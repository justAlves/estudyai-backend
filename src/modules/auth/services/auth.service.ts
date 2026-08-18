import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "../../../database";
import { refreshTokens } from "../../../database/tables/refresh-tokens.table";
import { passwordResetTokens } from "../../../database/tables/password-reset-tokens.table";
import { users } from "../../../database/tables/users.table";
import type { ForgotPasswordDto } from "../dtos/forgot-password.dto";
import type { LoginDto } from "../dtos/login.dto";
import type { RefreshTokenDto } from "../dtos/refresh-token.dto";
import type { RegisterDto } from "../dtos/register.dto";
import type { ResetPasswordDto } from "../dtos/reset-password.dto";
import type { VerifyResetCodeDto } from "../dtos/verify-reset-code.dto";
import { WhatsAppError, whatsAppService } from "../../notifications/services/whatsapp.service";

type SignAccessToken = (userId: string) => Promise<string>;

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 409 | 503,
    message: string,
  ) {
    super(message);
  }
}

export class AuthService {
  async requestPasswordReset(input: ForgotPasswordDto) {
    if (!whatsAppService.isConfigured) throw new AuthError(503, "WhatsApp indisponível no momento");

    const [user] = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (!user) return;

    const [recentToken] = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, new Date(Date.now() - 60_000))))
      .limit(1);

    if (recentToken) return;

    const code = String(randomInt(100_000, 1_000_000));
    const id = ulid();

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    await db.insert(passwordResetTokens).values({
      id,
      userId: user.id,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    try {
      await whatsAppService.sendText(user.phone, `Seu código EstudeAI é ${code}. Ele expira em 10 minutos.`);
    } catch (error) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, id));
      if (error instanceof WhatsAppError) throw new AuthError(503, error.message);
      throw error;
    }
  }

  async verifyResetCode(input: VerifyResetCodeDto) {
    await this.validateResetCode(input);
  }

  async resetPassword(input: ResetPasswordDto) {
    const user = await this.validateResetCode(input);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ password: await Bun.password.hash(input.password) }).where(eq(users.id, user.id));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
    });
  }

  private async validateResetCode(input: VerifyResetCodeDto) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (!user) throw new AuthError(401, "Código inválido ou expirado");

    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.expiresAt, new Date())))
      .limit(1);

    if (!token || token.attempts >= 5) throw new AuthError(401, "Código inválido ou expirado");

    if (token.codeHash !== hashToken(input.code)) {
      await db.update(passwordResetTokens).set({ attempts: token.attempts + 1 }).where(eq(passwordResetTokens.id, token.id));
      throw new AuthError(401, "Código inválido ou expirado");
    }

    return user;
  }

  async register(input: RegisterDto, signAccessToken: SignAccessToken) {
    const [user] = await db
      .insert(users)
      .values({
        id: ulid(),
        name: input.name,
        email: input.email.toLowerCase(),
        password: await Bun.password.hash(input.password),
        phone: input.phone,
        firstLoginAt: new Date(),
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (!user) throw new AuthError(409, "E-mail já está em uso");

    return this.issueTokens(user.id, signAccessToken);
  }

  async login(input: LoginDto, signAccessToken: SignAccessToken) {
    const [user] = await db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (!user || !(await Bun.password.verify(input.password, user.password))) {
      throw new AuthError(401, "E-mail ou senha inválidos");
    }

    return this.issueTokens(user.id, signAccessToken);
  }

  async refresh(input: RefreshTokenDto, signAccessToken: SignAccessToken) {
    const [session] = await db
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, hashToken(input.refreshToken)),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: refreshTokens.userId });

    if (!session) throw new AuthError(401, "Refresh token inválido ou expirado");

    return this.issueTokens(session.userId, signAccessToken);
  }

  private async issueTokens(userId: string, signAccessToken: SignAccessToken) {
    const refreshToken = randomUUID();

    await db.insert(refreshTokens).values({
      id: ulid(),
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return { accessToken: await signAccessToken(userId), refreshToken };
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
