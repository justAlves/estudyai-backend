import { env } from "../../../config/env";
import type { RagQuestion } from "../../rag/services/rag.service";
import type { StudyActivity } from "../../../database/tables/study-materials.table";

export class GeminiGenerationError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(message);
  }
}

export function materialRetryDelayMs(attempt: number) {
  return Math.min(300_000, 15_000 * 2 ** Math.max(0, attempt - 1));
}

export function sourceList(questions: RagQuestion[]) {
  return [...new Map(questions.map((question) => [question.sourceUrl, { label: `${question.source.toUpperCase()} · ${question.eventDate} · Questão ${question.questionNumber}`, url: question.sourceUrl }])).values()];
}

export function generationModels(model: string) {
  return model === "gemini-2.5-flash" ? [model, "gemini-3.6-flash"] : [model];
}

export function parseActivities(content: string): StudyActivity[] {
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as StudyActivity[];
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item.question === "string" && item.options.length === 4 && Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 4 && typeof item.explanation === "string")) throw new Error("Gemini retornou atividades inválidas.");
  return parsed;
}

export function activityScore(activities: StudyActivity[], answers: number[]) {
  return answers.filter((answer, index) => answer === activities[index].answer).length;
}

export async function generateMaterial(subject: string, questions: RagQuestion[], syllabus = "", estimatedMinutes = 60) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Defina GEMINI_API_KEY para gerar materiais.");
  const context = questions.map((question) => question.content).join("\n\n---\n\n");
  const target = Math.max(45, Math.min(90, estimatedMinutes));
  const prompt = `Você é um professor experiente de cursos preparatórios para concursos e vestibulares no Brasil. Crie uma aula realmente completa sobre ${subject}, em português brasileiro e Markdown, planejada para aproximadamente ${target} minutos de estudo concentrado.

Não faça um resumo superficial. Desenvolva todos os tópicos e subtópicos explicitamente presentes no CONTEÚDO PROGRAMÁTICO DE REFERÊNCIA. O conteúdo deve ser autossuficiente para o estudante estudar sem abrir outra fonte.

Estruture obrigatoriamente a aula com:
1. Título e o que o aluno será capaz de fazer ao final;
2. Mapa dos tópicos cobertos;
3. Pré-requisitos essenciais, apenas se necessários;
4. Explicação progressiva de cada tópico e subtópico, com definições claras, regras, classificações, exceções e relações entre conceitos;
5. Pelo menos 3 exemplos resolvidos passo a passo quando a matéria permitir; em Direito, inclua casos práticos; em exatas, cálculos completos; em línguas, frases analisadas;
6. Tabela comparativa ou quadro de diferenças quando houver conceitos parecidos;
7. Pegadinhas e erros recorrentes de provas;
8. Checklist de revisão e resumo final;
9. Cinco perguntas discursivas de autoavaliação, sem gabarito imediato.

Use subtítulos Markdown, listas e tabelas para facilitar uma sessão longa de estudo. Quando houver hierarquia, fluxo ou relação entre elementos, use um bloco de código Mermaid simples; nunca use diagramas ASCII. Não invente leis, artigos, números, fórmulas, datas ou fatos que não estejam no edital ou no contexto. Se um detalhe não puder ser confirmado, sinalize a limitação em vez de inventar. Não mencione que você recebeu um prompt, contexto ou edital.

${syllabus ? `CONTEÚDO PROGRAMÁTICO DE REFERÊNCIA:\n${syllabus}` : "Não há edital estruturado disponível; use apenas o escopo comprovado pelas questões de contexto e deixe explícitas as limitações."}

QUESTÕES DE CONTEXTO:\n${context}`;
  const generate = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ generationConfig: { temperature: 0.35, maxOutputTokens: 7_000 }, contents: [{ parts: [{ text: prompt }] }] }),
  });
  const models = generationModels(env.GEMINI_GENERATION_MODEL);
  let response = await generate(models[0]);
  if (response.status === 404 && models[1]) response = await generate(models[1]);
  if (!response.ok) {
    const responseBody = await response.text();
    const retryAfterSeconds = Number(responseBody.match(/"retryDelay"\s*:\s*"(\d+)s"/)?.[1]);
    throw new GeminiGenerationError(`Gemini geração falhou (${response.status}): ${responseBody}`, response.status === 429 || response.status >= 500, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : undefined);
  }

  const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = body.candidates?.[0]?.content?.parts?.map(({ text }) => text ?? "").join("").trim();
  if (!content) throw new Error("Gemini não retornou material.");
  if (content.replace(/\s+/g, " ").trim().length < 3_000) throw new Error("Gemini retornou um material curto demais para a sessão planejada.");
  return content;
}

export async function generateActivities(subject: string, questions: RagQuestion[], syllabus = "") {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Defina GEMINI_API_KEY para gerar atividades.");
  const context = questions.map((question) => question.content).join("\n\n---\n\n");
  const prompt = `Crie 5 questões objetivas de fixação sobre ${subject}, dentro do conteúdo programático e fundamentadas no contexto. Cada questão deve ser completamente autossuficiente: inclua no enunciado todos os dados, regras e situação necessários para respondê-la. Nunca mencione ou dependa de "o texto", "o item", "a imagem", "a figura", "a tabela", "o gráfico", "o circuito", "a questão anterior", "o material" ou qualquer conteúdo que não esteja reproduzido no próprio enunciado. Não adapte questões do contexto que dependam desses elementos externos. Retorne somente JSON: [{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]. A resposta correta deve ser o índice de 0 a 3.${syllabus ? `\n\nCONTEÚDO PROGRAMÁTICO DE REFERÊNCIA:\n${syllabus}` : ""}\n\nCONTEXTO:\n${context}`;
  const generate = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const models = generationModels(env.GEMINI_GENERATION_MODEL);
  let response = await generate(models[0]);
  if (response.status === 404 && models[1]) response = await generate(models[1]);
  if (!response.ok) throw new GeminiGenerationError(`Gemini geração falhou (${response.status}): ${await response.text()}`, response.status === 429 || response.status >= 500);
  const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return parseActivities(body.candidates?.[0]?.content?.parts?.map(({ text }) => text ?? "").join("").trim() ?? "");
}
