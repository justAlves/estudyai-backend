import { z } from "zod";

export const forgotPasswordDto = z.object({
  email: z.email(),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordDto>;
