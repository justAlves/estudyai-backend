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

function noticeHeadingMatches(text: string) {
  const matches = [
    ...text.matchAll(/^\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ0-9 /().,&'’\-]{1,119}):/gm),
    // Alguns editais, como o da PMDF, omitem os dois-pontos em títulos cujo
    // conteúdo começa imediatamente pelo item 1.
    ...text.matchAll(/^\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÜ /().,&'’\-]{2,119})\s+1(?=\s)/gm),
  ];
  return matches
    .map((match) => ({ subject: match[1].replace(/\s+/g, " ").trim(), start: match.index ?? 0 }))
    .sort((left, right) => left.start - right.start)
    .filter((match, index, all) => index === 0 || match.start !== all[index - 1].start);
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
  const headings = noticeHeadingMatches(text)
    .map(({ subject }) => subject)
    .filter((heading) => {
      const normalized = normalizedHeading(heading);
      return heading.length >= 3 && !genericNoticeHeadings.has(normalized) && !/^(ANEXO|CARGO|CONHECIMENTOS|MODULO|PERFIL)\b/.test(normalized);
    })
    .filter((heading) => !/^\d/.test(heading))
    .filter((heading) => !heading.includes(" - PERFIL"));
  return uniqueSubjects(headings).slice(0, 60);
}

export function noticeSubjectSections(text: string, subjects: string[]) {
  const headings = noticeHeadingMatches(text)
    .map((match, index, all) => ({
      ...match,
      end: all[index + 1]?.start ?? text.length,
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
    // A resposta da IA pode ser válida, mas incompleta quando o edital é
    // grande. Os títulos determinísticos são a fonte de verdade sempre que
    // encontrarem mais matérias no trecho programático.
    return fallback.length > parsed.length ? fallback : parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}
