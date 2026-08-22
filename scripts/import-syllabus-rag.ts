import { createHash } from "node:crypto";
import { ulid } from "ulid";
import { env } from "../src/config/env";
import { db } from "../src/database";
import { ragSyllabusChunks } from "../src/database/tables/rag-syllabus-chunks.table";
import { contestKey } from "../src/modules/onboarding/services/contest-subjects.service";
import { retryDelayMs } from "../src/workers/rag-ingestion.worker";

type Syllabus = { name: string; subs: string[]; content: string[] };
const model = "gemini-embedding-2";

async function embed(inputs: string[]) {
  if (!env.GEMINI_API_KEY) throw new Error("Defina GEMINI_API_KEY para indexar os editais.");
  let response: Response;
  while (true) {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ requests: inputs.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] }, embedContentConfig: { outputDimensionality: 768 } })) }),
    });
    if (response.ok) break;
    const error = await response.text();
    const delay = response.status === 429 ? retryDelayMs(error) : null;
    if (!delay) throw new Error(`Gemini embeddings falhou (${response.status}): ${error}`);
    console.log(`Limite do Gemini atingido; tentando novamente em ${Math.ceil(delay / 1_000)}s.`);
    await Bun.sleep(delay);
  }
  const embeddings = ((await response.json()) as { embeddings: { values: number[] }[] }).embeddings.map(({ values }) => values);
  if (embeddings.length !== inputs.length || embeddings.some((values) => values.length !== 768)) throw new Error("Gemini retornou embeddings incompatíveis com o RAG de editais.");
  return embeddings;
}

const syllabuses = await Bun.file(new URL("./subs.json", import.meta.url)).json() as Syllabus[];
const chunks = syllabuses.flatMap(({ name, subs, content }) => subs.map((subject, index) => ({ contestName: name, normalizedContestName: contestKey(name), subject, content: content[index] })).filter((chunk): chunk is { contestName: string; normalizedContestName: string; subject: string; content: string } => !!chunk.content));
const embeddings: number[][] = [];
for (let index = 0; index < chunks.length; index += 50) embeddings.push(...await embed(chunks.slice(index, index + 50).map((chunk) => `${chunk.contestName}\n${chunk.subject}\n${chunk.content}`)));
await db.transaction(async (tx) => {
  await tx.delete(ragSyllabusChunks);
  await tx.insert(ragSyllabusChunks).values(chunks.map((chunk, index) => ({ id: ulid(), ...chunk, contentHash: createHash("sha256").update(`${chunk.normalizedContestName}\n${chunk.subject}\n${chunk.content}`).digest("hex"), embedding: embeddings[index], embeddingModel: model })));
});
console.log(`RAG de editais indexado: ${chunks.length} conteúdos.`);
