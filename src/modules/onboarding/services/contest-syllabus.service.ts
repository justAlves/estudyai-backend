import { contestKey } from "./contest-subjects.service";
import { db } from "../../../database";
import { ragSyllabusChunks } from "../../../database/tables/rag-syllabus-chunks.table";
import { contestNoticeDocuments } from "../../../database/tables/contest-notice-documents.table";
import { noticeSubjectSections } from "./notice-subjects.service";
import { embedQuery, vectorLiteral } from "../../rag/services/rag.service";
import { eq, sql } from "drizzle-orm";

type SyllabusCandidate = { key: string; name: string };
type SyllabusMatch = { key: string; related: boolean };

function aliases(name: string) {
  const words: string[] = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const initials = words.map((word) => word[0]);
  const meaningfulInitials = words.filter((word) => !["de", "do", "da", "dos", "das", "e"].includes(word)).map((word) => word[0]);
  const prefixes = (letters: string[]) => letters.map((_, index) => letters.slice(0, index + 1).join(""));
  const stateLess = words.filter((word) => word.length > 4 && /(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$/.test(word)).map((word) => word.slice(0, -2)).filter((word) => word.length >= 3);
  const department = words.includes("secretaria") && words.includes("educacao") ? "sed" : words.includes("secretaria") && words.includes("saude") ? "ses" : contestKey(name).match(/^(sed|ses)/)?.[1] ?? "";
  return [...new Set([contestKey(name), ...prefixes(initials), ...prefixes(meaningfulInitials), ...stateLess, department, ...words.filter((word) => word.length >= 3 && word.length <= 5)])];
}

function distance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) current.push(Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + Number(left[row - 1] !== right[column - 1])));
    previous = current;
  }
  return previous[right.length];
}

function directSyllabusMatch(name: string, candidates: SyllabusCandidate[]) {
  const key = contestKey(name);
  const inputAliases = aliases(name).filter((alias) => alias.length >= 3);
  const matches = candidates.map((candidate) => {
    const candidateAliases = aliases(candidate.name).filter((alias) => alias.length >= 3);
    const prefixLength = Math.max(0, ...inputAliases.flatMap((alias) => candidateAliases.filter((other) => other.startsWith(alias) || alias.startsWith(other)).map((other) => Math.min(alias.length, other.length))));
    const score = key === candidate.key || key.includes(candidate.key) || candidate.key.includes(key) ? 4
      : inputAliases.some((alias) => candidateAliases.includes(alias)) ? 3
        : prefixLength >= 4 ? 2 + prefixLength / 100
          // ponytail: O(n²) alias comparison is fine for the ~100 imported contests; index aliases if that catalog grows materially.
          : inputAliases.some((alias) => alias.length >= 4 && candidateAliases.some((other) => other.length >= 4 && distance(alias, other) <= 1)) ? 1 : 0;
    return { key: candidate.key, score };
  }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score);
  return matches.length && (matches.length === 1 || matches[0].score > matches[1].score) ? matches[0].key : undefined;
}

function organizationFamily(name: string) {
  const words = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const initials = words.filter((word) => !["de", "do", "da", "dos", "das", "e"].includes(word)).map((word) => word[0]).join("");
  const first = words[0] ?? "";
  return ((words.length === 1 || (words.length > 1 && first.length <= 6)) ? first : initials).slice(0, 2);
}

function relatedSyllabusMatch(name: string, candidates: SyllabusCandidate[]) {
  const family = organizationFamily(name);
  if (family.length < 2) return undefined;
  const roles = ["soldado", "agente", "delegado", "escrivao", "perito", "tecnico", "analista", "professor", "pedagogo", "supervisor", "auditor", "especialista", "enfermeiro", "tecnologista", "escriturario"];
  const role = roles.find((item) => contestKey(name).includes(item));
  const matches = candidates.filter((candidate) => organizationFamily(candidate.name) === family && (!role || contestKey(candidate.name).includes(role))).sort((left, right) => left.key.localeCompare(right.key));
  return role || matches.length === 1 ? matches[0]?.key : undefined;
}

export function matchingSyllabusKey(name: string, candidates: SyllabusCandidate[]) {
  return directSyllabusMatch(name, candidates) ?? relatedSyllabusMatch(name, candidates);
}

async function syllabusKeyForContest(name: string): Promise<SyllabusMatch | undefined> {
  const candidates = await db.selectDistinct({ key: ragSyllabusChunks.normalizedContestName, name: ragSyllabusChunks.contestName }).from(ragSyllabusChunks);
  const direct = directSyllabusMatch(name, candidates);
  if (direct) return { key: direct, related: false };
  const related = relatedSyllabusMatch(name, candidates);
  return related ? { key: related, related: true } : undefined;
}

export async function syllabusSubjectsForContest(name: string) {
  const match = await syllabusKeyForContest(name);
  if (!match) return [];
  const rows = await db.selectDistinct({ subject: ragSyllabusChunks.subject }).from(ragSyllabusChunks).where(eq(ragSyllabusChunks.normalizedContestName, match.key));
  return rows.map(({ subject }) => subject);
}

export async function syllabusContext(name: string, subject: string, contestId?: string) {
  if (contestId) {
    const [notice] = await db.select({ extractedText: contestNoticeDocuments.extractedText }).from(contestNoticeDocuments).where(eq(contestNoticeDocuments.contestId, contestId)).limit(1);
    if (notice?.extractedText) {
      const sections = noticeSubjectSections(notice.extractedText, [subject]);
      const content = sections.length ? sections.map(({ content: section }) => section).join("\n\n") : notice.extractedText;
      return `EDITAL ENVIADO PELO ESTUDANTE\nMatéria solicitada: ${subject}\n\n${content}`;
    }
  }
  const match = await syllabusKeyForContest(name);
  if (!match) return "";
  const embedding = vectorLiteral(await embedQuery(subject));
  const chunks = await db.execute(sql`
    SELECT contest_name AS "contestName", subject, content
    FROM rag_syllabus_chunks
    WHERE normalized_contest_name = ${match.key}
    ORDER BY embedding <=> ${embedding}::vector
    LIMIT 3
  `) as unknown as { contestName: string; subject: string; content: string }[];
  const origin = match.related ? `EDITAL RELACIONADO: ${chunks[0]?.contestName}. Use como referência geral; não invente regras específicas da localidade.` : "";
  return [origin, ...chunks.map((chunk) => `MATÉRIA: ${chunk.subject}\nCONTEÚDO ESPECÍFICO: ${chunk.content}`)].filter(Boolean).join("\n\n");
}
