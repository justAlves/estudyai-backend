import { jsonb, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { studyTasks } from "./study-tasks.table";

export type StudyActivity = { question: string; options: string[]; answer: number; explanation: string };

export const studyMaterials = pgTable("study_materials", {
  id: varchar("id", { length: 26 }).primaryKey(),
  taskId: varchar("task_id", { length: 26 }).notNull().references(() => studyTasks.id, { onDelete: "cascade" }).unique(),
  content: text("content").notNull(),
  sources: jsonb("sources").$type<{ label: string; url: string }[]>().notNull(),
  activities: jsonb("activities").$type<StudyActivity[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
