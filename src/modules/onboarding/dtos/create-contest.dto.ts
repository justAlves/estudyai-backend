import { z } from "zod";

export const createContestDto = z.object({
  name: z.string().trim().min(2).max(160),
  examiningBoard: z.string().trim().min(2).max(120),
  examDate: z.iso.date(),
  isPopular: z.boolean().default(false),
  supportSubjects: z.array(z.string().trim().min(2).max(120)).min(1),
});

export type CreateContestDto = z.infer<typeof createContestDto>;
