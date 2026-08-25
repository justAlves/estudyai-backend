import { expect, test } from "bun:test";
import { noticeContentForSubjectExtraction, noticeSubjectSections, parseNoticeSubjects, subjectsFromNoticeHeadings } from "./notice-subjects.service";
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

test("reconhece títulos sem dois-pontos usados pelo edital da PMDF", () => {
  const text = `
LÍNGUA PORTUGUESA: 1 Compreensão de textos.
DIREITO PENAL MILITAR 1 Aplicação da lei penal militar. ${"Tópico complementar. ".repeat(5)}
DIREITO PROCESSUAL PENAL MILITAR: 1 Processo penal militar.
`;
  expect(subjectsFromNoticeHeadings(text)).toEqual([
    "LÍNGUA PORTUGUESA",
    "DIREITO PENAL MILITAR",
    "DIREITO PROCESSUAL PENAL MILITAR",
  ]);
  const section = noticeSubjectSections(text, ["DIREITO PENAL MILITAR"])[0]?.content;
  expect(section).toContain("Aplicação da lei penal militar");
});

test("separa trechos do edital por disciplina para o RAG global", () => {
  const chunks = noticeRagChunks("PMDF CFO", `LÍNGUA PORTUGUESA: ${"interpretação e gramática ".repeat(20)}\nLEGISLAÇÃO: ${"normas da PMDF ".repeat(20)}`, ["LÍNGUA PORTUGUESA", "LEGISLAÇÃO"]);
  expect(new Set(chunks.map(({ subject }) => subject))).toEqual(new Set(["LÍNGUA PORTUGUESA", "LEGISLAÇÃO"]));
  expect(chunks.every(({ normalizedContestName, content }) => normalizedContestName === "pmdfcfo" && content.length <= 7_000)).toBe(true);
});

test("completa matérias truncadas pela IA sem indexar o edital inteiro", () => {
  const chunks = noticeRagChunks("PMDF CFO", `DOS OBJETOS DE AVALIAÇÃO\nLÍNGUA PORTUGUESA: ${"interpretação e gramática ".repeat(20)}\nLEGISLAÇÃO: ${"normas da PMDF ".repeat(20)}`, ["LÍNGUA PORTUGUESA"]);
  expect(new Set(chunks.map(({ subject }) => subject))).toEqual(new Set(["LÍNGUA PORTUGUESA", "LEGISLAÇÃO"]));
  expect(chunks.every(({ content }) => !content.startsWith("DOS OBJETOS DE AVALIAÇÃO"))).toBe(true);
});
