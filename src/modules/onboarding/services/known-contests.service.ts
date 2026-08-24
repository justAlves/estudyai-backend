import { inArray } from "drizzle-orm";
import { db } from "../../../database";
import { knownContests, knownContestSubjects } from "../../../database/tables/known-contests.table";
import { contestKey, uniqueSubjects } from "./contest-subjects.service";

export { contestKey, uniqueSubjects };

export async function knownSubjectsForContest(name: string) {
  const key = contestKey(name);
  if (!key) return [];
  const catalog = await db.select().from(knownContests);
  const contests = catalog.filter((contest) => key === contest.normalizedName || key.includes(contest.normalizedName) || contest.normalizedName.includes(key));
  if (!contests.length) return [];
  const subjects = await db.select({ name: knownContestSubjects.name }).from(knownContestSubjects).where(inArray(knownContestSubjects.contestId, contests.map((contest) => contest.id)));
  return uniqueSubjects(subjects.map((subject) => subject.name));
}
