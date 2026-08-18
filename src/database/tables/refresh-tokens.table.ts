import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.table";

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id", { length: 26 }).primaryKey(),
  userId: varchar("user_id", { length: 26 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
