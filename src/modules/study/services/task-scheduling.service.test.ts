import { strict as assert } from "node:assert";
import { nextAvailableStudyDay } from "./task-scheduling.service";

const task = { id: "missed", scheduledFor: "2026-01-02", estimatedMinutes: 18, status: "PENDING" };
assert.equal(nextAvailableStudyDay([task, { id: "monday", scheduledFor: "2026-01-05", estimatedMinutes: 30, status: "PENDING" }], task, 30, new Date("2026-01-02T12:00:00Z")), "2026-01-06");
assert.equal(nextAvailableStudyDay([task, { id: "done", scheduledFor: "2026-01-05", estimatedMinutes: 30, status: "COMPLETED" }], task, 30, new Date("2026-01-02T12:00:00Z")), "2026-01-05");
console.info("study scheduling check passed");
