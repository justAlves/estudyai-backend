import { env } from "../../../config/env";
import { uniqueSubjects } from "./contest-subjects.service";

const genericNoticeHeadings = new Set([
  "ANEXO",
  "CARGO",
  "CONHECIMENTOS",
  "CONHECIMENTOS GERAIS",
  "CONHECIMENTOS ESPECIFICOS",
  "CONTEUDO PROGRAMATICO",
  "MODULO",
  "PERFIL",
]);

function normalizedHeading(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Editais normalmente colocam o conteúdo programático no fim do arquivo.
 * Mantemos o texto completo para materiais, mas focamos essa seção para a
 * extração de disciplinas e não descartamos o conteúdo por causa do limite.
 */
export function noticeContentForSubjectExtraction(text: string) {
  const markers = [
    /ANEXO\s+[IVXLCDM]+\s*[-–—:]\s*CONTEÚDO\s+PROGRAMÁTICO/gi,
    /DOS\s+OBJETOS\s+DE\s+AVALIAÇÃO/gi,
    /CONTEÚDO\s+PROGRAMÁTICO/gi,
  ];
  const indexes = markers.flatMap((marker) => [...text.matchAll(marker)].map((match) => match.index ?? -1));
  const start = Math.max(...indexes, 0);
  const focused = start > 0 ? text.slice(start) : text;
  return focused.slice(0, 140_000);
}

/** Fallback para editais em que a IA está indisponível ou não responde. */
export function subjectsFromNoticeHeadings(text: string) {
  const headings = [...text.matchAll(/^\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9 /().,&'’\-]{1,119}):/gm)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter((heading) => {
      const normalized = normalizedHeading(heading);
      return heading.length >= 3 && !genericNoticeHeadings.has(normalized) && !/^(ANEXO|CARGO|CONHECIMENTOS|MODULO|PERFIL)\b/.test(normalized);
    })
    .filter((heading) => !/^\d/.test(heading))
    .filter((heading) => !heading.includes(" - PERFIL"));
  return uniqueSubjects(headings).slice(0, 60);
}

export function noticeSubjectSections(text: string, subjects: string[]) {
  const headings = [...text.matchAll(/^\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9 /().,&'’\-]{1,119}):/gm)]
    .map((match, index, all) => ({
      subject: match[1].replace(/\s+/g, " ").trim(),
      start: match.index ?? 0,
      end: all[index + 1]?.index ?? text.length,
    }))
    .filter(({ subject }) => subjects.some((candidate) => normalizedHeading(candidate) === normalizedHeading(subject)));
  return headings.map(({ subject, start, end }) => ({ subject, content: text.slice(start, end).trim() })).filter(({ content }) => content.length > 80);
}

export function parseNoticeSubjects(content: string) {
  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content.replace(/^```(?:json)?\s*|\s*```$/gi, "");
  const parsed = JSON.parse(json) as { subjects?: unknown };
  const values = Array.isArray(parsed.subjects) ? parsed.subjects : [];
  return uniqueSubjects(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter((value) => value.length >= 2 && value.length <= 120)).slice(0, 60);
}

export async function extractNoticeSubjects(name: string, text: string) {
  const focusedText = noticeContentForSubjectExtraction(text);
  const fallback = subjectsFromNoticeHeadings(focusedText);
  if (!env.GEMINI_API_KEY) return fallback;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_GENERATION_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ generationConfig: { responseMimeType: "application/json" }, contents: [{ parts: [{ text: `Extraia somente as disciplinas do conteúdo programático do edital ${name}. Não retorne tópicos, cargos, módulos, perfis ou grupos genéricos. Considere todas as disciplinas de todos os perfis/cargos quando houver mais de um. Responda apenas JSON no formato {"subjects":["Língua Portuguesa"]}.\n\nCONTEÚDO PROGRAMÁTICO:\n${focusedText}` }] }] }),
  });
  if (!response.ok) return fallback;
  try {
    const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const parsed = parseNoticeSubjects(body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "");
    return parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}
