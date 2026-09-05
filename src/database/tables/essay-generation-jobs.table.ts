import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { essays } from "./essays.table";
export type EssayJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export const essayGenerationJobs = pgTable("essay_generation_jobs", {
  id: varchar("id", { length: 26 }).primaryKey(),
  essayId: varchar("essay_id", { length: 26 }).notNull().unique().references(() => essays.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).$type<EssayJobStatus>().notNull().default("QUEUED"),
  attemptCount: integer("attempt_count").notNull().default(0),
  errorMessage: text("error_message"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
