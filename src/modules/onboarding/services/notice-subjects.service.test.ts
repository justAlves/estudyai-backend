import { expect, test } from "bun:test";
import { noticeContentForSubjectExtraction, parseNoticeSubjects, subjectsFromNoticeHeadings } from "./notice-subjects.service";
import { noticeRagChunks } from "./notice-rag.service";

test("normaliza a lista de disciplinas extraída do edital", () => {
  expect(parseNoticeSubjects('{"subjects":[" Português ","Matemática","",42]}')).toEqual(["Português", "Matemática"]);
});

test("prioriza a seção de conteúdo programático no fim do edital", () => {
  const text = `${"capa ".repeat(40_000)}\nANEXO I – CONTEÚDO PROGRAMÁTICO\nLÍNGUA PORTUGUESA: interpretação de textos`;
  const focused = noticeContentForSubjectExtraction(text);
  expect(focused).toContain("LÍNGUA PORTUGUESA:");
  expect(focused).not.toContain("capa capa capa");
});

test("extrai disciplinas pelos títulos do conteúdo quando a IA não está disponível", () => {
  expect(subjectsFromNoticeHeadings(`
LÍNGUA PORTUGUESA: interpretação de textos
LEGISLAÇÃO: leis aplicáveis
RACIOCÍNIO LÓGICO: proposições
MODULO II - CONHECIMENTOS ESPECÍFICOS: conteúdo
`)).toEqual(["LÍNGUA PORTUGUESA", "LEGISLAÇÃO", "RACIOCÍNIO LÓGICO"]);
});

test("separa trechos do edital por disciplina para o RAG global", () => {
  const chunks = noticeRagChunks("PMDF CFO", `LÍNGUA PORTUGUESA: ${"interpretação e gramática ".repeat(20)}\nLEGISLAÇÃO: ${"normas da PMDF ".repeat(20)}`, ["LÍNGUA PORTUGUESA", "LEGISLAÇÃO"]);
  expect(new Set(chunks.map(({ subject }) => subject))).toEqual(new Set(["LÍNGUA PORTUGUESA", "LEGISLAÇÃO"]));
  expect(chunks.every(({ normalizedContestName, content }) => normalizedContestName === "pmdfcfo" && content.length <= 7_000)).toBe(true);
});
