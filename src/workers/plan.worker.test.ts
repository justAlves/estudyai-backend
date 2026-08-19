import { expect, test } from "bun:test";
import { initialTasks } from "./plan.worker";

test("generates four weekdays-only weeks of starter tasks", () => {
  const tasks = initialTasks(["Português", "Matemática"], 120, new Date(2026, 7, 17));
  expect(tasks).toHaveLength(40);
  expect(tasks.every((task) => ![0, 6].includes(new Date(`${task.scheduledFor}T00:00:00`).getDay()))).toBeTrue();
});
