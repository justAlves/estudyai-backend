import { z } from "zod";

export const createContestDto = z.object({
  name: z.string().trim().min(2).max(160),
  examiningBoard: z.string().trim().min(2).max(120),
  examDate: z.iso.date(),
  isPopular: z.boolean().default(false),
  dailyStudyMinutes: z.union([z.literal(30), z.literal(60), z.literal(120), z.literal(180), z.literal(240)]),
  supportSubjects: z.array(z.string().trim().min(2).max(120)).min(1),
});

export const saveOnboardingDto = createContestDto.extend({
  socialName: z.string().trim().min(2).max(120),
  plan: z.enum(["free", "pro"]),
  complete: z.boolean(),
});

export type CreateContestDto = z.infer<typeof createContestDto>;
export type SaveOnboardingDto = z.infer<typeof saveOnboardingDto>;
