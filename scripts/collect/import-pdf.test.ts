import { extractQuestionCandidates, pastDate } from "./import-pdf";
import { officialUrl, sourceFrom } from "./source";
import { collectable } from "./run";
import { pdfLinks } from "./discover";

const questions = extractQuestionCandidates(`Instruções gerais\n\n1. Qual alternativa está correta?\nA) Primeira alternativa com texto suficiente para passar na validação do coletor simples.\nB) Segunda alternativa.\n\n2) Marque a opção adequada.\nA) Texto adicional que também faz esta questão ter mais de oitenta caracteres no total.\nB) Outra opção.`);

if (questions.length !== 2 || questions[0].number !== 1 || questions[1].number !== 2) {
  throw new Error("A extração de questões numeradas falhou.");
}

const namedQuestion = extractQuestionCandidates("QUESTÃO 7\nTexto de uma questão de banca que contém conteúdo suficiente para confirmar a extração com o marcador por extenso.");
if (namedQuestion.length !== 1 || namedQuestion[0].number !== 7) {
  throw new Error("A extração de questões com marcador por extenso falhou.");
}

const cebraspeItems = extractQuestionCandidates("71 Item no formato Cebraspe com texto suficiente para confirmar que o marcador numérico de item também é extraído corretamente.", "cebraspe");
if (cebraspeItems.length !== 1 || cebraspeItems[0].number !== 71) {
  throw new Error("A extração de itens do Cebraspe falhou.");
}

try {
  pastDate("2026-99-99");
  throw new Error("A validação de data inválida falhou.");
} catch (error) {
  if (!(error instanceof Error) || error.message !== "Informe uma data de prova/publicação anterior a hoje (AAAA-MM-DD).") throw error;
}

if (officialUrl(sourceFrom("cebraspe"), "https://cdn.cebraspe.org.br/concursos/exemplo.pdf").hostname !== "cdn.cebraspe.org.br") {
  throw new Error("A allowlist de bancas falhou.");
}

if (officialUrl(sourceFrom("fgv"), "http://oab.fgv.br/arq/prova.pdf").protocol !== "https:") {
  throw new Error("O redirecionamento HTTPS de fonte oficial falhou.");
}

if (!collectable("Caderno de Questões", /caderno/i) || collectable("Resultado do recurso contra gabarito", /gabarito/i)) {
  throw new Error("O filtro de documentos coletáveis falhou.");
}

const ibfc = pdfLinks('<li class="pdf"><a style="display:block" href="https://anexos.cdn.selecao.net.br/uploads/teste.pdf">Caderno de Questões - Versão A<span>29/10/2023</span></a></li>', new URL("https://concursos.ibfc.org.br/informacoes/430/"), sourceFrom("ibfc"));
if (ibfc.length !== 1 || !ibfc[0].label.includes("Caderno")) {
  throw new Error("A descoberta de PDFs do IBFC falhou.");
}

console.log("collect:check passou");
