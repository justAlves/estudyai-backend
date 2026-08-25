import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { env } from "../config/env";
import { db } from "../database";
import { ragQuestions } from "../database/tables/rag-questions.table";
import { workerLogger } from "../config/logger";
import { createWorker, enqueueRagIngestion, queueNames } from "../queues";

const embeddingModel = "gemini-embedding-2";
const logger = workerLogger("rag");

type Metadata = {
  source: string;
  kind: string;
  eventDate: string;
  sourceUrl: string;
  sha256: string;
};

type Question = { number: number; text: string };

type Candidate = {
  content: string;
  contentHash: string;
  source: string;
  sourceHash: string;
  sourceUrl: string;
  eventDate: string;
  questionNumber: number;
};

export function normalizeQuestion(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function candidateFrom(question: Question, metadata: Metadata): Candidate | null {
  const content = normalizeQuestion(question.text);
  if (!content) return null;

  return {
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    source: metadata.source,
    sourceHash: metadata.sha256,
    sourceUrl: metadata.sourceUrl,
    eventDate: metadata.eventDate,
    questionNumber: question.number,
  };
}

export function retryDelayMs(body: string) {
  const seconds = Number(/"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body)?.[1]);
  return Number.isFinite(seconds) ? Math.max(1_000, Math.ceil(seconds * 1_000)) : null;
}

async function embed(inputs: string[]) {
  if (!env.GEMINI_API_KEY) throw new Error("Defina GEMINI_API_KEY para indexar o RAG.");

  let response: Response;
  while (true) {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        requests: inputs.map((text) => ({
          model: `models/${embeddingModel}`,
          content: { parts: [{ text }] },
          embedContentConfig: { outputDimensionality: 768 },
        })),
      }),
    });
    if (response.ok) break;

    const error = await response.text();
    const delay = response.status === 429 ? retryDelayMs(error) : null;
    if (!delay) throw new Error(`Gemini embeddings falhou (${response.status}): ${error}`);
    logger.warn({ delayMs: delay }, "limite do Gemini · aguardando para retomar");
    await Bun.sleep(delay);
  }

  const body = (await response.json()) as { embeddings: { values: number[] }[] };
  const embeddings = body.embeddings.map(({ values }) => values);
  if (embeddings.length !== inputs.length || embeddings.some((embedding) => embedding.length !== 768)) {
    throw new Error("Gemini retornou embeddings incompatíveis com o índice RAG.");
  }
  return embeddings;
}

async function indexFile(metadataPath: string) {
  const directory = metadataPath.slice(0, metadataPath.lastIndexOf("/"));
  const metadata = (await Bun.file(metadataPath).json()) as Metadata;
  if (metadata.kind !== "exam") return { indexed: 0, skipped: 0 };

  const questions = (await Bun.file(`${directory}/question-candidates.json`).json()) as Question[];
  const candidates = questions.map((question) => candidateFrom(question, metadata)).filter((candidate): candidate is Candidate => candidate !== null);
  const existing = await db.select({ contentHash: ragQuestions.contentHash }).from(ragQuestions).where(inArray(ragQuestions.contentHash, candidates.map(({ contentHash }) => contentHash)));
  const known = new Set(existing.map(({ contentHash }) => contentHash));
  const pending = candidates.filter(({ contentHash }) => !known.has(contentHash));
  logger.debug({ source: metadata.source, questions: candidates.length, pending: pending.length }, "arquivo de questões preparado");

  for (let index = 0; index < pending.length; index += 50) {
    const batch = pending.slice(index, index + 50);
    const embeddings = await embed(batch.map(({ content }) => content));
    await db.insert(ragQuestions).values(batch.map((question, position) => ({ id: ulid(), ...question, embedding: embeddings[position], embeddingModel }))).onConflictDoNothing();
    logger.debug({ source: metadata.source, indexed: Math.min(index + batch.length, pending.length), total: pending.length }, "lote RAG indexado");
  }

  return { indexed: pending.length, skipped: candidates.length - pending.length };
}

export async function indexQuestions() {
  let indexed = 0;
  let skipped = 0;
  for await (const metadataPath of new Bun.Glob("data/ingestion/*/metadata.json").scan(".")) {
    const result = await indexFile(metadataPath);
    indexed += result.indexed;
    skipped += result.skipped;
  }
  return { indexed, skipped };
}

if (import.meta.main) {
  const worker = createWorker<{ jobId: string }>(queueNames.rag, async () => {
    logger.info("iniciando indexação do RAG");
    const result = await indexQuestions();
    logger.info(result, "RAG atualizado com sucesso");
    return result;
  });
  worker.on("error", (error) => logger.error({ err: error }, "erro de conexão do worker"));
  await enqueueRagIngestion();
  logger.info("worker online · aguardando indexação RAG");
}
