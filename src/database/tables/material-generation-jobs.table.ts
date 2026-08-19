import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { studyTasks } from "./study-tasks.table";

export const materialGenerationJobs = pgTable("material_generation_jobs", {
  id: varchar("id", { length: 26 }).primaryKey(),
  taskId: varchar("task_id", { length: 26 }).notNull().references(() => studyTasks.id, { onDelete: "cascade" }).unique(),
  status: varchar("status", { length: 16 }).notNull().default("QUEUED"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
