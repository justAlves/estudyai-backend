import { relations } from "drizzle-orm";
import { contestSupportSubjects } from "./tables/contest-support-subjects.table";
import { contests } from "./tables/contests.table";
import { passwordResetTokens } from "./tables/password-reset-tokens.table";
import { refreshTokens } from "./tables/refresh-tokens.table";
import { users } from "./tables/users.table";

export const usersRelations = relations(users, ({ many }) => ({
  contests: many(contests),
  passwordResetTokens: many(passwordResetTokens),
  refreshTokens: many(refreshTokens),
}));

export const contestsRelations = relations(contests, ({ one, many }) => ({
  user: one(users, {
    fields: [contests.userId],
    references: [users.id],
  }),
  supportSubjects: many(contestSupportSubjects),
}));

export const contestSupportSubjectsRelations = relations(contestSupportSubjects, ({ one }) => ({
  contest: one(contests, {
    fields: [contestSupportSubjects.contestId],
    references: [contests.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));
