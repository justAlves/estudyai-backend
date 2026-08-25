import { integer, jsonb, pgTable, text, unique, varchar } from "drizzle-orm/pg-core";
import { simulations } from "./simulations.table";

export type SimulationDifficulty = "EASY" | "MEDIUM" | "HARD";

export const simulationQuestions = pgTable("simulation_questions", {
  id: varchar("id", { length: 26 }).primaryKey(),
  simulationId: varchar("simulation_id", { length: 26 }).notNull().references(() => simulations.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  subject: varchar("subject", { length: 120 }).notNull(),
  statement: text("statement").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctOption: integer("correct_option").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: varchar("difficulty", { length: 16 }).$type<SimulationDifficulty>().notNull().default("MEDIUM"),
}, (table) => ({ simulationPositionUnique: unique().on(table.simulationId, table.position) }));
