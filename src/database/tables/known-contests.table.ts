import { timestamp, unique, varchar, pgTable, text } from "drizzle-orm/pg-core";

export const knownContests = pgTable("known_contests", {
  id: varchar("id", { length: 26 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 160 }).notNull().unique(),
  examiningBoard: varchar("examining_board", { length: 120 }),
  noticeUrl: text("notice_url").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export const knownContestSubjects = pgTable("known_contest_subjects", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 }).notNull().references(() => knownContests.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
}, (table) => [unique().on(table.contestId, table.name)]);
