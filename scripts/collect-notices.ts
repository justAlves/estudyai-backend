import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { env } from "../src/config/env";
import { db } from "../src/database";
import { knownContests, knownContestSubjects } from "../src/database/tables/known-contests.table";
import { contestKey, uniqueSubjects } from "../src/modules/onboarding/services/contest-subjects.service";
import { discoverOfficialPdfs } from "./collect/discover";
import { seeds } from "./collect/seeds";
import { officialUrl } from "./collect/source";

type NoticeSeed = { name: string; examiningBoard?: string; noticeUrl: string };
const noticeDocument = /\bedital\b|abertura|conte[úu]do program[áa]tico|programa de provas/i;
const GEMINI_REQUEST_INTERVAL_MS = 60_000;
let lastGeminiRequestAt = 0;

function invalidSubjects(content: string, reason: string) {
  const response = content.replace(/\s+/g, " ").trim().slice(0, 1_500) || "(resposta vazia)";
  return new Error(`${reason}. Resposta da IA: ${response}`);
}

export function geminiWaitMs(lastRequestAt: number, now = Date.now()) {
  return Math.max(0, GEMINI_REQUEST_INTERVAL_MS - (now - lastRequestAt));
}

export function noticeDocumentScore(label: string) {
  if (!noticeDocument.test(label)) return -1;
  if (/retifica|resultado|homologa|convoca/i.test(label)) return 0;
  if (/conte[úu]do program[áa]tico|programa de provas/i.test(label)) return 3;
  if (/edital.*abertura|abertura.*edital/i.test(label)) return 2;
  return 1;
}

export function parseNoticeSubjects(content: string) {
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content.replace(/^```(?:json)?\s*|\s*```$/gi, "");
  let parsed: { subjects?: unknown; disciplinas?: unknown; materias?: unknown } | unknown[];
  try {
    parsed = JSON.parse(json) as { subjects?: unknown; disciplinas?: unknown; materias?: unknown } | unknown[];
  } catch {
    throw invalidSubjects(content, "A IA não retornou JSON válido");
  }
  const values = Array.isArray(parsed) ? parsed : parsed.subjects ?? parsed.disciplinas ?? parsed.materias;
  if (!Array.isArray(values)) throw invalidSubjects(content, "A IA não retornou a lista de matérias");
  const subjects = uniqueSubjects(values.map((subject) => typeof subject === "string" ? subject : typeof subject === "object" && subject && "name" in subject && typeof subject.name === "string" ? subject.name : "").map((subject) => subject.trim()).filter((subject) => subject.length >= 2 && subject.length <= 120));
  if (!subjects.length || subjects.length > 60) throw invalidSubjects(content, "A IA retornou uma lista de matérias inválida");
  return subjects;
}

export function curriculumExcerpt(text: string) {
  const headings = [...text.matchAll(/conte[úu]do program[aá]tico|programa de provas?|disciplinas|conhecimentos (?:b[aá]sicos|espec[ií]ficos)/gi)];
  const excerpts = headings.slice(0, 8).map((heading) => text.slice(Math.max(0, heading.index! - 500), heading.index! + 24_000));
  return (excerpts.length ? excerpts.join("\n\n---\n\n") : text).slice(0, 180_000);
}

async function noticeText(url: string) {
  const response = await fetch(url, { headers: { "user-agent": "EstudyAI-notice-importer/1.0" }, redirect: "follow" });
  if (!response.ok) throw new Error(`Não foi possível baixar o edital: HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 100 * 1024 * 1024 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new Error("A URL precisa apontar para um PDF de até 100 MB.");

  const directory = await mkdtemp(join(tmpdir(), "estudeai-notice-"));
  const pdf = join(directory, "notice.pdf");
  const text = join(directory, "notice.txt");
  try {
    await Bun.write(pdf, bytes);
    const process = Bun.spawn(["pdftotext", "-raw", pdf, text], { stdout: "inherit", stderr: "inherit" });
    if ((await process.exited) !== 0) throw new Error("pdftotext falhou ao extrair o edital.");
    const extracted = await Bun.file(text).text();
    if (extracted.replace(/\s+/g, "").length >= 500) return extracted;

    console.log(`• OCR ativado para edital sem texto extraível: ${url}`);
    const prefix = join(directory, "page");
    const render = Bun.spawn(["pdftoppm", "-jpeg", "-r", "200", pdf, prefix], { stdout: "inherit", stderr: "inherit" });
    if ((await render.exited) !== 0) throw new Error("pdftoppm falhou ao preparar o OCR do edital.");
    const pages = (await readdir(directory)).filter((file) => /^page-\d+\.jpg$/i.test(file)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const ocr: string[] = [];
    for (const page of pages) {
      const process = Bun.spawn(["tesseract", join(directory, page), "stdout", "-l", "por"], { stdout: "pipe", stderr: "ignore" });
      const output = await new Response(process.stdout).text();
      if ((await process.exited) !== 0) throw new Error(`OCR falhou na página ${page}.`);
      ocr.push(output);
    }
    return ocr.join("\n\n");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function extractSubjects(name: string, text: string) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Defina GEMINI_API_KEY para importar editais.");
  const excerpt = curriculumExcerpt(text);
  const generate = async (model: string, correction?: boolean) => {
    const wait = geminiWaitMs(lastGeminiRequestAt);
    if (wait) await Bun.sleep(wait);
    lastGeminiRequestAt = Date.now();
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { subjects: { type: "ARRAY", items: { type: "STRING" } } }, required: ["subjects"] } }, contents: [{ parts: [{ text: `${correction ? "A resposta anterior foi inválida. " : ""}Analise exclusivamente o trecho do edital abaixo, priorizando a seção de conteúdo programático. Extraia as matérias cobradas no concurso ${name}. Matéria é o título que agrupa tópicos: em "Língua Portuguesa" seguido de "- Interpretação de textos", retorne apenas "Língua Portuguesa". Não retorne grupos genéricos como "Conhecimentos gerais" ou "Conteúdos específicos", nem os tópicos com hífen. Retorne somente {"subjects":[...]}, com no máximo 60 matérias, por exemplo {"subjects":["Língua Portuguesa","Direito Constitucional"]}. Se o trecho não trouxer matérias, retorne {"subjects":[]}.\n\nTRECHO DO EDITAL:\n${excerpt}` }] }] }),
    });
  };
  let model = env.GEMINI_GENERATION_MODEL;
  let response = await generate(model);
  if (response.status === 404 && model === "gemini-2.5-flash") {
    model = "gemini-3.6-flash";
    response = await generate(model);
  }
  for (let attempt = 0; response.status === 429 && attempt < 3; attempt += 1) {
    await Bun.sleep(60_000);
    response = await generate(model);
  }
  if (!response.ok) throw new Error(`Gemini falhou: HTTP ${response.status}.`);
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  try {
    return parseNoticeSubjects(content);
  } catch (firstError) {
    let retry = await generate(model, true);
    for (let attempt = 0; retry.status === 429 && attempt < 3; attempt += 1) {
      await Bun.sleep(60_000);
      retry = await generate(model, true);
    }
    if (!retry.ok) throw new Error(`Gemini falhou: HTTP ${retry.status}.`);
    const retryBody = await retry.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      return parseNoticeSubjects(retryBody.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "");
    } catch (retryError) {
      throw new Error(`${retryError instanceof Error ? retryError.message : String(retryError)} Primeira tentativa: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
    }
  }
}

async function importNotice(seed: NoticeSeed) {
  if (!seed.name?.trim() || !seed.noticeUrl?.startsWith("https://")) throw new Error("Cada edital precisa de name e noticeUrl HTTPS.");
  const subjects = await extractSubjects(seed.name, await noticeText(seed.noticeUrl));
  await db.transaction(async (tx) => {
    const [contest] = await tx.insert(knownContests).values({ id: ulid(), name: seed.name.trim(), normalizedName: contestKey(seed.name), examiningBoard: seed.examiningBoard?.trim() || null, noticeUrl: seed.noticeUrl }).onConflictDoUpdate({ target: knownContests.normalizedName, set: { name: seed.name.trim(), examiningBoard: seed.examiningBoard?.trim() || null, noticeUrl: seed.noticeUrl, importedAt: new Date() } }).returning();
    await tx.delete(knownContestSubjects).where(eq(knownContestSubjects.contestId, contest.id));
    await tx.insert(knownContestSubjects).values(subjects.map((name) => ({ id: ulid(), contestId: contest.id, name })));
  });
  console.log(`✓ ${seed.name}: ${subjects.join(", ")}`);
}

export async function collectNotices() {
  for (const seed of seeds) {
    try {
      const documents = await discoverOfficialPdfs(seed.source, officialUrl(seed.source, seed.pageUrl));
      const document = documents.filter((candidate) => noticeDocumentScore(candidate.label) >= 0).sort((left, right) => noticeDocumentScore(right.label) - noticeDocumentScore(left.label))[0];
      if (!document) {
        console.log(`• ${seed.name}: edital não encontrado na página oficial`);
        continue;
      }
      await importNotice({ name: seed.name, examiningBoard: seed.source.toUpperCase(), noticeUrl: document.url });
    } catch (error) {
      console.log(`✗ ${seed.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (import.meta.main) await collectNotices();
