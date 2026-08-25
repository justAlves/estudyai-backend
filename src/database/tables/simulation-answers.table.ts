import { integer, pgTable, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { simulationQuestions } from "./simulation-questions.table";
import { simulations } from "./simulations.table";

export const simulationAnswers = pgTable("simulation_answers", {
  id: varchar("id", { length: 26 }).primaryKey(),
  simulationId: varchar("simulation_id", { length: 26 }).notNull().references(() => simulations.id, { onDelete: "cascade" }),
  questionId: varchar("question_id", { length: 26 }).notNull().references(() => simulationQuestions.id, { onDelete: "cascade" }),
  selectedOption: integer("selected_option"),
  answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ simulationQuestionUnique: unique().on(table.simulationId, table.questionId) }));
