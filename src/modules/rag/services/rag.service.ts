import { sql } from "drizzle-orm";
import { env } from "../../../config/env";
import { db } from "../../../database";

const embeddingModel = "gemini-embedding-2";

export type RagQuestion = { content: string; source: string; sourceUrl: string; eventDate: string; questionNumber: number; similarity: number };

export function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

export async function embedQuery(query: string) {
  if (!env.GEMINI_API_KEY) throw new Error("Defina GEMINI_API_KEY para consultar o RAG.");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ content: { parts: [{ text: query }] }, embedContentConfig: { outputDimensionality: 768 } }),
  });
  if (!response.ok) throw new Error(`Gemini embeddings falhou (${response.status}): ${await response.text()}`);

  const embedding = ((await response.json()) as { embedding: { values: number[] } }).embedding.values;
  if (embedding.length !== 768) throw new Error("Gemini retornou um embedding incompatível com o índice RAG.");
  return embedding;
}

export async function searchQuestions(query: string, limit = 5) {
  const embedding = vectorLiteral(await embedQuery(query));
  const result = await db.execute(sql`
    SELECT content, source, source_url AS "sourceUrl", event_date AS "eventDate", question_number AS "questionNumber",
      1 - (embedding <=> ${embedding}::vector) AS similarity
    FROM rag_questions
    ORDER BY embedding <=> ${embedding}::vector
    LIMIT ${limit}
  `);
  return result as unknown as RagQuestion[];
}
