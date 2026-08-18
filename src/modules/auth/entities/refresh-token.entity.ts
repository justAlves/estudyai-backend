import type { refreshTokens } from "../../../database/tables/refresh-tokens.table";

export type RefreshTokenEntity = typeof refreshTokens.$inferSelect;
