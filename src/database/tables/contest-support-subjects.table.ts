import { pgTable, varchar } from "drizzle-orm/pg-core";
import { contests } from "./contests.table";

export const contestSupportSubjects = pgTable("contest_support_subjects", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 })
    .notNull()
    .references(() => contests.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
});
