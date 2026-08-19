import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { contests } from "./contests.table";

export const planGenerationJobs = pgTable("plan_generation_jobs", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 }).notNull().unique().references(() => contests.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("QUEUED"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
