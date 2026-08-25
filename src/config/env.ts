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
    LOG_PRETTY: z.enum(["true", "false"]).transform((value) => value === "true").default("true"),
    EVOLUTION_GO_URL: z.url().optional(),
    EVOLUTION_GO_API_KEY: z.string().min(1).optional(),
    EVOLUTION_INSTANCE_NAME: z.string().min(1).optional(),
    APP_URL: z.url().default("http://localhost:3000"),
    ABACATEPAY_API_KEY: z.string().min(1).optional(),
    ABACATEPAY_PRO_PRODUCT_ID: z.string().min(1).optional(),
    ABACATEPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
    MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
    MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
    MERCADOPAGO_NOTIFICATION_URL: z.url().optional(),
    MERCADOPAGO_PRO_PRICE_CENTS: z.coerce.number().int().positive().default(5990),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_GENERATION_MODEL: z.string().min(1).default("gemini-3.6-flash"),
    R2_ENDPOINT: z.url().optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  })
  .parse(process.env);
