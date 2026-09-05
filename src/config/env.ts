import { z } from "zod";

export const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    CORS_ORIGIN: z.url().default("http://localhost:8081"),
    DATABASE_URL: z
      .url()
      .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://")),
    REDIS_URL: z.url().optional(),
    JWT_SECRET: z.string().min(32),
    OTEL_SERVICE_NAME: z.string().min(1).default("estudeai-api"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    LOG_PRETTY: z.enum(["true", "false"]).transform((value) => value === "true").default(true),
    ENABLE_DEBUG_ENDPOINTS: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
    EVOLUTION_GO_URL: z.url().optional(),
    EVOLUTION_GO_API_KEY: z.string().min(1).optional(),
    EVOLUTION_INSTANCE_NAME: z.string().min(1).optional(),
    APP_URL: z.url().default("http://localhost:3000"),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    STRIPE_PRO_PRICE_ID: z.string().startsWith("price_").optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_GENERATION_MODEL: z.string().min(1).default("gemini-3.6-flash"),
    R2_ENDPOINT: z.url().optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  })
  .parse(process.env);
