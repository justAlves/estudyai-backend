import { cors } from "@elysia/cors";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { authController } from "./modules/auth/controllers/auth.controller";
import { onboardingController } from "./modules/onboarding/controllers/onboarding.controller";
import { billingController } from "./modules/billing/controllers/billing.controller";
import { ragController } from "./modules/rag/controllers/rag.controller";
import { studyController } from "./modules/study/controllers/study.controller";
import { simulationsController } from "./modules/simulations/controllers/simulations.controller";
import { launchController } from "./modules/launch/controllers/launch.controller";
import { essaysController } from "./modules/essays/controllers/essays.controller";
import { apiLogger } from "./config/logger";

export const app = new Elysia()
  .onRequest(({ request }) => {
    apiLogger.info({ method: request.method, path: new URL(request.url).pathname }, "requisição recebida");
  })
  .onError(({ code, error, request, set }) => {
    apiLogger.error({ err: error, code, method: request.method, path: new URL(request.url).pathname, status: set.status }, "erro não tratado na API");
    if (set.status === 200) set.status = 500;
    return { message: "Erro interno do servidor.", requestId: request.headers.get("x-request-id") ?? undefined };
  })
  .use(cors({ origin: env.CORS_ORIGIN }))
  .use(opentelemetry({ serviceName: env.OTEL_SERVICE_NAME }))
  .use(
    swagger({
      documentation: {
        info: { title: "EstudeAI API", version: "1.0.0" },
      },
    }),
  )
  .use(authController)
  .use(onboardingController)
  .use(billingController)
  .use(ragController)
  .use(studyController)
  .use(simulationsController)
  .use(launchController)
  .use(essaysController)
  .get("/", () => "Hello Elysia");
