import { createHash } from "node:crypto";
import { ulid } from "ulid";
import { env } from "../../../config/env";
import { db } from "../../../database";
import { ragSyllabusChunks } from "../../../database/tables/rag-syllabus-chunks.table";
import { contestKey, uniqueSubjects } from "./contest-subjects.service";
import { noticeContentForSubjectExtraction, noticeSubjectSections, subjectsFromNoticeHeadings } from "./notice-subjects.service";
import { eq } from "drizzle-orm";

const embeddingModel = "gemini-embedding-2";
const maxChunkLength = 7_000;

type RagChunk = { contestName: string; normalizedContestName: string; subject: string; content: string };

function splitContent(content: string) {
  const chunks: string[] = [];
  for (let start = 0; start < content.length; start += maxChunkLength) {
    const chunk = content.slice(start, start + maxChunkLength).trim();
    if (chunk.length >= 80) chunks.push(chunk);
  }
  return chunks;
}

async function embed(inputs: string[]) {
  if (!env.GEMINI_API_KEY) throw new Error("Defina GEMINI_API_KEY para indexar o edital no RAG.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:batchEmbedContents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ requests: inputs.map((text) => ({ model: `models/${embeddingModel}`, content: { parts: [{ text }] }, embedContentConfig: { outputDimensionality: 768 } })) }),
  });
  if (!response.ok) throw new Error(`Gemini embeddings falhou (${response.status}): ${await response.text()}`);
  const values = ((await response.json()) as { embeddings: { values: number[] }[] }).embeddings.map(({ values }) => values);
  if (values.length !== inputs.length || values.some((value) => value.length !== 768)) throw new Error("Gemini retornou embeddings incompatíveis com o RAG de editais.");
  return values;
}

export function noticeRagChunks(contestName: string, text: string, subjects: string[]) {
  const focused = noticeContentForSubjectExtraction(text);
  // A lista da IA pode vir truncada. Os títulos do próprio edital completam
  // essa lista para que uma matéria nunca receba o documento inteiro como
  // fallback.
  const allSubjects = uniqueSubjects(subjects, subjectsFromNoticeHeadings(focused));
  const sections = noticeSubjectSections(focused, allSubjects);
  const grouped = new Map<string, { subject: string; content: string }>();
  for (const section of sections) {
    const key = contestKey(section.subject);
    const previous = grouped.get(key);
    grouped.set(key, { subject: previous?.subject ?? section.subject, content: previous ? `${previous.content}\n\n${section.content}` : section.content });
  }
  return [...grouped.values()].flatMap(({ subject, content }) => splitContent(content).map((chunk) => ({ contestName, normalizedContestName: contestKey(contestName), subject, content: chunk })));
}

export async function indexNoticeInGlobalRag(contestName: string, text: string, subjects: string[]) {
  const chunks = noticeRagChunks(contestName, text, subjects);
  if (!chunks.length) return { indexed: 0, skipped: 0 };

  const embeddings: number[][] = [];
  for (let index = 0; index < chunks.length; index += 50) {
    embeddings.push(...await embed(chunks.slice(index, index + 50).map((chunk) => `${chunk.contestName}\n${chunk.subject}\n${chunk.content}`)));
  }

  const rows = chunks.map((chunk, index) => ({
    id: ulid(),
    ...chunk,
    contentHash: createHash("sha256").update(`${chunk.normalizedContestName}\n${chunk.subject}\n${chunk.content}`).digest("hex"),
    embedding: embeddings[index],
    embeddingModel,
  }));
  const inserted = await db.transaction(async (tx) => {
    // Um novo edital substitui a versão anterior; caso contrário, os chunks
    // antigos (por exemplo, somente Português) continuam aparecendo no RAG.
    await tx.delete(ragSyllabusChunks).where(eq(ragSyllabusChunks.normalizedContestName, contestKey(contestName)));
    return tx.insert(ragSyllabusChunks).values(rows).onConflictDoNothing().returning({ id: ragSyllabusChunks.id });
  });
  return { indexed: inserted.length, skipped: 0 };
}
