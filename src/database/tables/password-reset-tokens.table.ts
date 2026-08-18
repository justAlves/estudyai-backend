import { index, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.table";

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    userId: varchar("user_id", { length: 26 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("password_reset_tokens_user_id_created_at_idx").on(table.userId, table.createdAt)],
);
