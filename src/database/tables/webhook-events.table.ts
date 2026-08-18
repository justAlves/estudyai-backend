import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id", { length: 120 }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
