import { z } from "zod";

export const resetPasswordDto = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(72),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordDto>;
