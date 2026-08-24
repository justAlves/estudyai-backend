import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { contests } from "./contests.table";

export const contestNoticeDocuments = pgTable("contest_notice_documents", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 }).notNull().references(() => contests.id, { onDelete: "cascade" }).unique(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull().unique(),
  status: varchar("status", { length: 16 }).notNull().default("RECEIVED"),
  extractedText: text("extracted_text"),
  subjects: jsonb("subjects").$type<string[]>().default([]).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
