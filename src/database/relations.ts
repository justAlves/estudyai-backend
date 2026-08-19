import { relations } from "drizzle-orm";
import { contestSupportSubjects } from "./tables/contest-support-subjects.table";
import { contests } from "./tables/contests.table";
import { passwordResetTokens } from "./tables/password-reset-tokens.table";
import { refreshTokens } from "./tables/refresh-tokens.table";
import { users } from "./tables/users.table";
import { subscriptions } from "./tables/subscriptions.table";
import { planGenerationJobs } from "./tables/plan-generation-jobs.table";
import { studyTasks } from "./tables/study-tasks.table";
import { materialGenerationJobs } from "./tables/material-generation-jobs.table";
import { studyMaterials } from "./tables/study-materials.table";

export const usersRelations = relations(users, ({ many }) => ({
  contests: many(contests),
  passwordResetTokens: many(passwordResetTokens),
  refreshTokens: many(refreshTokens),
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
}));

export const contestsRelations = relations(contests, ({ one, many }) => ({
  user: one(users, {
    fields: [contests.userId],
    references: [users.id],
  }),
  supportSubjects: many(contestSupportSubjects),
  generationJobs: many(planGenerationJobs),
  tasks: many(studyTasks),
}));

export const planGenerationJobsRelations = relations(planGenerationJobs, ({ one }) => ({
  contest: one(contests, { fields: [planGenerationJobs.contestId], references: [contests.id] }),
}));

export const studyTasksRelations = relations(studyTasks, ({ one }) => ({
  contest: one(contests, { fields: [studyTasks.contestId], references: [contests.id] }),
  material: one(studyMaterials),
  materialJob: one(materialGenerationJobs),
}));

export const studyMaterialsRelations = relations(studyMaterials, ({ one }) => ({
  task: one(studyTasks, { fields: [studyMaterials.taskId], references: [studyTasks.id] }),
}));

export const materialGenerationJobsRelations = relations(materialGenerationJobs, ({ one }) => ({
  task: one(studyTasks, { fields: [materialGenerationJobs.taskId], references: [studyTasks.id] }),
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
