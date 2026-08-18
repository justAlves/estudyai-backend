import { expect, test } from "bun:test";
import { saveOnboardingDto } from "./create-contest.dto";

test("accepts an onboarding draft without completing it", () => {
  expect(saveOnboardingDto.parse({
    socialName: "Ana",
    name: "ENEM",
    examDate: "2026-11-08",
    examiningBoard: "INEP",
    isPopular: true,
    supportSubjects: ["Matemática"],
    plan: "free",
    complete: false,
  }).complete).toBeFalse();
});
