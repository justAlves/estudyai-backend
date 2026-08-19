import { integer, jsonb, pgTable, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { studyTasks } from "./study-tasks.table";

export const studyActivityAttempts = pgTable("study_activity_attempts", {
  id: varchar("id", { length: 26 }).primaryKey(),
  taskId: varchar("task_id", { length: 26 }).notNull().references(() => studyTasks.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<number[]>().notNull(),
  score: integer("score").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("study_activity_attempts_task_id_unique").on(table.taskId)]);
