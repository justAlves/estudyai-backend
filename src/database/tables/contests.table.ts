import { boolean, date, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.table";

export const contests = pgTable("contests", {
  id: varchar("id", { length: 26 }).primaryKey(),
  userId: varchar("user_id", { length: 26 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  examiningBoard: varchar("examining_board", { length: 120 }).notNull(),
  examDate: date("exam_date").notNull(),
  isPopular: boolean("is_popular").notNull().default(false),
  noticeUrl: text("notice_url"),
  noticeImportedAt: timestamp("notice_imported_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
