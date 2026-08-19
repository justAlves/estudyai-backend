import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { officialUrl, sourceFrom, type Source } from "./source";

const MAX_BYTES = 100 * 1024 * 1024;
const kinds = ["exam", "answer-key", "notice", "essay-booklet"] as const;
export type Kind = (typeof kinds)[number];

export function extractQuestionCandidates(text: string, source?: Source) {
  const starts = [
    ...text.matchAll(/(?:^|\n)\s*QUEST(?:ÃO|AO)\s+(\d{1,3})\b/gi),
    ...text.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[.)-]\s+/g),
    // ponytail: numbered tables can resemble Cebraspe items; add a source-specific parser if retrieval quality shows false positives.
    ...(source === "cebraspe" ? text.matchAll(/(?:^|\n)\s*(\d{1,3})\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g) : []),
  ]
    .filter((match) => match.index !== undefined)
    .sort((left, right) => left.index! - right.index!);

  return starts
    .map((match, index) => ({
      number: Number(match[1]),
      text: text.slice(match.index, starts[index + 1]?.index).trim(),
    }))
    .filter((question, index, all) => question.text.length >= 80 && all.findIndex((other) => other.number === question.number && other.text === question.text) === index);
}

function kindFrom(value: string | undefined): Kind {
  if (kinds.includes(value as Kind)) return value as Kind;
  throw new Error(`Tipo inválido. Use: ${kinds.join(", ")}.`);
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchPdf(url: URL) {
  let error: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, { headers: { "user-agent": "EstudyAI-research-bot/1.0" }, redirect: "follow" });
    } catch (caught) {
      error = caught;
      await Bun.sleep(500 * (attempt + 1));
    }
  }
  throw error;
}

async function cachedImport(source: Source, sourceUrl: string) {
  // ponytail: linear local scan; use a database index when the corpus makes this measurable.
  for await (const path of new Bun.Glob("data/ingestion/*/metadata.json").scan(".")) {
    const metadata = await Bun.file(path).json() as { source?: Source; sourceUrl?: string; sha256?: string };
    if (metadata.source === source && metadata.sourceUrl === sourceUrl && metadata.sha256) {
      return { ...metadata, directory: join("data", "ingestion", metadata.sha256), cached: true };
    }
  }
}

export function pastDate(value: string | undefined) {
  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;
  if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value || value >= new Date().toISOString().slice(0, 10)) {
    throw new Error("Informe uma data de prova/publicação anterior a hoje (AAAA-MM-DD).");
  }
  return value;
}

export async function importPdf(source: Source, kind: Kind, eventDate: string, urlValue: string) {
  const url = officialUrl(source, urlValue);
  const cached = await cachedImport(source, url.toString());
  if (cached) return cached;
  const response = await fetchPdf(url);
  if (!response.ok) throw new Error(`Não foi possível baixar o PDF: HTTP ${response.status}.`);
  officialUrl(source, response.url);
  if (!response.headers.get("content-type")?.includes("pdf")) throw new Error("A URL não retornou um PDF.");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("PDF maior que 100 MB.");

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("PDF maior que 100 MB.");

  const hash = await sha256(bytes);
  const dir = join("data", "ingestion", hash);
  const pdfPath = join(dir, "source.pdf");
  const textPath = join(dir, "source.txt");
  await mkdir(dir, { recursive: true });
  await Bun.write(pdfPath, bytes);

  const process = Bun.spawn(["pdftotext", "-raw", pdfPath, textPath], { stdout: "inherit", stderr: "inherit" });
  if ((await process.exited) !== 0) throw new Error("pdftotext falhou ao extrair o PDF.");

  const text = await Bun.file(textPath).text();
  const questions = kind === "exam" ? extractQuestionCandidates(text, source) : [];
  const metadata = { source, kind, eventDate, sourceUrl: url.toString(), collectedAt: new Date().toISOString(), sha256: hash, originalName: basename(url.pathname), extraction: "pdftotext-raw", questionCandidates: questions.length };
  await Bun.write(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));
  await Bun.write(join(dir, "question-candidates.json"), JSON.stringify(questions, null, 2));
  return { ...metadata, directory: dir, cached: false };
}

if (import.meta.main) {
  const [sourceValue, kindValue, eventDateValue, urlValue] = Bun.argv.slice(2);
  if (!sourceValue || !kindValue || !eventDateValue || !urlValue) {
    console.error("Uso: bun run collect:pdf <banca> <exam|answer-key|notice|essay-booklet> <AAAA-MM-DD> <url-do-pdf>");
    process.exit(1);
  }
  console.log(JSON.stringify(await importPdf(sourceFrom(sourceValue), kindFrom(kindValue), pastDate(eventDateValue), urlValue), null, 2));
}
