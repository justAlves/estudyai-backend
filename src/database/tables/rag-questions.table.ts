import { date, integer, pgTable, text, timestamp, unique, varchar, vector } from "drizzle-orm/pg-core";

export const ragQuestions = pgTable(
  "rag_questions",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    embeddingModel: varchar("embedding_model", { length: 64 }).notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    eventDate: date("event_date").notNull(),
    questionNumber: integer("question_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("rag_questions_content_hash_unique").on(table.contentHash)],
);
