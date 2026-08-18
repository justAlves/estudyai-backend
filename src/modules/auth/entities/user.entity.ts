import type { users } from "../../../database/tables/users.table";

export type UserEntity = typeof users.$inferSelect;
