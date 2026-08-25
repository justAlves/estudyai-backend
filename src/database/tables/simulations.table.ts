import { integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { contests } from "./contests.table";

export type SimulationStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "FINISHED";

export const simulations = pgTable("simulations", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 }).notNull().references(() => contests.id, { onDelete: "cascade" }),
  questionCount: integer("question_count").notNull(),
  subjects: jsonb("subjects").$type<string[]>().notNull(),
  status: varchar("status", { length: 16 }).$type<SimulationStatus>().notNull().default("QUEUED"),
  score: integer("score"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
