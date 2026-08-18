import { z } from "zod";

export const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    CORS_ORIGIN: z.url().default("http://localhost:8081"),
    DATABASE_URL: z
      .url()
      .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://")),
    JWT_SECRET: z.string().min(32),
    OTEL_SERVICE_NAME: z.string().min(1).default("estudeai-api"),
    EVOLUTION_GO_URL: z.url().optional(),
    EVOLUTION_GO_API_KEY: z.string().min(1).optional(),
    EVOLUTION_INSTANCE_NAME: z.string().min(1).optional(),
  })
  .parse(process.env);
