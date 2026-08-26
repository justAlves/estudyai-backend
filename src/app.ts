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

export const app = new Elysia()
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
  .get("/", () => "Hello Elysia");
