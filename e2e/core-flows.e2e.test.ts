import { describe, expect, test } from "bun:test";

const runE2E = process.env.E2E_DATABASE_URL ? describe : describe.skip;

runE2E("fluxo principal de conta e onboarding", () => {
  let app: typeof import("../src/app").app;
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  const password = "senha-e2e-123";

  test("registra, consulta status, conclui onboarding e consulta plano", async () => {
    process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
    ({ app } = await import("../src/app"));

    const register = await app.handle(new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "E2E Student", email, password, phone: "+5511999999999" }),
    }));
    expect(register.status).toBe(200);
    const tokens = await register.json() as { accessToken: string; refreshToken: string };
    expect(tokens.accessToken).toBeString();

    const statusBefore = await app.handle(new Request("http://localhost/onboarding/status", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    }));
    expect(statusBefore.status).toBe(200);
    expect((await statusBefore.json()).completed).toBe(false);

    const onboarding = await app.handle(new Request("http://localhost/onboarding/", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ socialName: "E2E", name: "ENEM", examDate: "2027-11-07", examiningBoard: "INEP", isPopular: true, dailyStudyMinutes: 60, supportSubjects: ["Matemática"], plan: "free", complete: true }),
    }));
    expect(onboarding.status).toBe(201);

    const statusAfter = await app.handle(new Request("http://localhost/onboarding/status", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    }));
    expect((await statusAfter.json()).completed).toBe(true);

    const plan = await app.handle(new Request("http://localhost/onboarding/plan", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    }));
    expect(plan.status).toBe(200);
    expect((await plan.json()).name).toBe("ENEM");

    const protectedWithoutToken = await app.handle(new Request("http://localhost/billing/status"));
    expect(protectedWithoutToken.status).toBe(401);
  });
});
