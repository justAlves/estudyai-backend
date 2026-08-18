import { z } from "zod";

export const registerDto = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  password: z.string().min(8).max(72),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
});

export type RegisterDto = z.infer<typeof registerDto>;
