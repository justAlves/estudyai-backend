import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/database";
import { contests } from "../src/database/tables/contests.table";
import { contestNoticeDocuments } from "../src/database/tables/contest-notice-documents.table";
import { indexNoticeInGlobalRag } from "../src/modules/onboarding/services/notice-rag.service";

const notices = await db
  .select({ contestName: contests.name, extractedText: contestNoticeDocuments.extractedText, subjects: contestNoticeDocuments.subjects })
  .from(contestNoticeDocuments)
  .innerJoin(contests, eq(contestNoticeDocuments.contestId, contests.id))
  .where(and(eq(contestNoticeDocuments.status, "COMPLETED"), isNotNull(contestNoticeDocuments.extractedText)));

for (const notice of notices) {
  if (!notice.extractedText) continue;
  const result = await indexNoticeInGlobalRag(notice.contestName, notice.extractedText, notice.subjects ?? []);
  console.info({ contestName: notice.contestName, ...result }, "edital existente indexado no RAG global");
}

console.info({ notices: notices.length }, "backfill de editais concluído");
