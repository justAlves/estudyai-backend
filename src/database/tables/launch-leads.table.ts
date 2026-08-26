import { boolean, pgTable, timestamp, unique, varchar } from "drizzle-orm/pg-core";

export const launchLeads = pgTable(
  "launch_leads",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 14 }).notNull(),
    wantsNotification: boolean("wants_notification").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({ phoneUnique: unique("launch_leads_phone_unique").on(table.phone) }),
);
