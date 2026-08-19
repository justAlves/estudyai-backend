import { date, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { contests } from "./contests.table";

export const studyTasks = pgTable("study_tasks", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 }).notNull().references(() => contests.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 120 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  scheduledFor: date("scheduled_for").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
