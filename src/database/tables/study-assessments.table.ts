import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { contests } from "./contests.table";

export const studyAssessments = pgTable("study_assessments", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 }).notNull().references(() => contests.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 120 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});
