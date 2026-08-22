import { index, pgTable, text, timestamp, unique, varchar, vector } from "drizzle-orm/pg-core";

export const ragSyllabusChunks = pgTable("rag_syllabus_chunks", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestName: varchar("contest_name", { length: 160 }).notNull(),
  normalizedContestName: varchar("normalized_contest_name", { length: 160 }).notNull(),
  subject: varchar("subject", { length: 120 }).notNull(),
  content: text("content").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  embeddingModel: varchar("embedding_model", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("rag_syllabus_chunks_content_unique").on(table.normalizedContestName, table.subject, table.contentHash),
  index("rag_syllabus_chunks_contest_idx").on(table.normalizedContestName),
]);
