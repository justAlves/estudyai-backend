import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.table";

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id", { length: 26 }).primaryKey(),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  providerCheckoutId: varchar("provider_checkout_id", { length: 120 }).notNull().unique(),
  providerSubscriptionId: varchar("provider_subscription_id", { length: 120 }).unique(),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
