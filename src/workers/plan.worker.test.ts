import { expect, test } from "bun:test";
import { initialTasks } from "./plan.worker";

test("generates four weekdays-only weeks of starter tasks", () => {
  const tasks = initialTasks(["Português", "Matemática"], 120, new Date(2026, 7, 17));
  expect(tasks).toHaveLength(40);
  expect(tasks.every((task) => ![0, 6].includes(new Date(`${task.scheduledFor}T00:00:00`).getDay()))).toBeTrue();
});

test("não coloca a matéria de reforço antes do conteúdo do edital", () => {
  const tasks = initialTasks(["Língua Portuguesa", "Direito Constitucional", "Matemática"], 120, new Date(2026, 7, 17));
  expect(tasks[0]?.subject).toBe("Língua Portuguesa");
  expect(tasks.slice(0, 6).map((task) => task.subject)).toEqual([
    "Língua Portuguesa", "Língua Portuguesa", "Direito Constitucional", "Direito Constitucional", "Matemática", "Matemática",
  ]);
  expect(tasks[0]?.title).toBe("Teoria e exemplos · Língua Portuguesa");
});

test("does not generate a plan without subjects or with an invalid daily goal", () => {
  expect(() => initialTasks([], 120)).toThrow("Plano sem matérias");
  expect(() => initialTasks(["Português"], 0)).toThrow("Meta diária inválida");
});
