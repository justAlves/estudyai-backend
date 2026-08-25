import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { simulations } from "./simulations.table";

export type SimulationJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export const simulationGenerationJobs = pgTable("simulation_generation_jobs", {
  id: varchar("id", { length: 26 }).primaryKey(),
  simulationId: varchar("simulation_id", { length: 26 }).notNull().references(() => simulations.id, { onDelete: "cascade" }).unique(),
  status: varchar("status", { length: 16 }).$type<SimulationJobStatus>().notNull().default("QUEUED"),
  attemptCount: integer("attempt_count").notNull().default(0),
  errorMessage: varchar("error_message", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
