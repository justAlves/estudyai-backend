import { customType, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { contests } from "./contests.table";

export type EssayAnalysis = {
  overallScore: number;
  summary: string;
  competencies: { name: string; score: number; maxScore: number; strengths: string[]; improvements: string[] }[];
  strengths: string[];
  improvements: string[];
  actionPlan: string[];
};

export type EssayStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const essays = pgTable("essays", {
  id: varchar("id", { length: 26 }).primaryKey(),
  contestId: varchar("contest_id", { length: 26 }).notNull().references(() => contests.id, { onDelete: "cascade" }),
  topic: varchar("topic", { length: 500 }).notNull(),
  essayText: text("essay_text"),
  fileName: varchar("file_name", { length: 255 }),
  mimeType: varchar("mime_type", { length: 120 }),
  status: varchar("status", { length: 16 }).$type<EssayStatus>().notNull().default("QUEUED"),
  fileData: binary("file_data"),
  analysis: jsonb("analysis").$type<EssayAnalysis>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
