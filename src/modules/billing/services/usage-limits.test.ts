import { expect, test } from "bun:test";
import { canConsumeMonthlyUsage, monthlyLimits, monthlyUsageKey } from "./usage-limits";

test("expõe as cotas mensais atuais por plano", () => {
  expect(monthlyLimits.FREE).toEqual({ SIMULATION: 2, ESSAY: 1 });
  expect(monthlyLimits.PRO).toEqual({ SIMULATION: 20, ESSAY: 8 });
});

test("bloqueia consumo ao alcançar a cota", () => {
  expect(canConsumeMonthlyUsage("FREE", "SIMULATION", 1)).toBe(true);
  expect(canConsumeMonthlyUsage("FREE", "SIMULATION", 2)).toBe(false);
  expect(canConsumeMonthlyUsage("PRO", "ESSAY", 7)).toBe(true);
  expect(canConsumeMonthlyUsage("PRO", "ESSAY", 8)).toBe(false);
});

test("gera uma chave estável por mês-calendário UTC", () => {
  expect(monthlyUsageKey(new Date("2027-01-31T23:59:00Z"))).toBe("2027-01");
  expect(monthlyUsageKey(new Date("2027-02-01T00:00:00Z"))).toBe("2027-02");
});
