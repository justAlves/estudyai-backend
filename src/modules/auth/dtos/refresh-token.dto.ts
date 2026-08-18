import { z } from "zod";

export const refreshTokenDto = z.object({
  refreshToken: z.string().uuid(),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenDto>;
