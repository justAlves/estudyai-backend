import { env } from "../../../config/env";
import { GeminiGenerationError, generationModels } from "../../study/services/material.service";
import { searchQuestions } from "../../rag/services/rag.service";
import { syllabusContext } from "../../onboarding/services/contest-syllabus.service";

export const simulationQuestionCounts = [5, 10, 20, 30] as const;

export type GeneratedSimulationQuestion = {
  subject: string;
  statement: string;
  options: string[];
  correctOption: number;
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};

function cleanJson(content: string) {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function optionText(option: unknown) {
  if (typeof option === "string") return option;
  if (option && typeof option === "object") {
    const object = option as Record<string, unknown>;
    return object.text ?? object.label ?? object.content ?? object.description ?? object.descricao ?? object.value ?? object.option ?? object.alternative ?? object.alternativa;
  }
  return option;
}

function optionList(value: unknown) {
  if (Array.isArray(value)) return value.map(optionText);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const keySets = [
    ["A", "B", "C", "D"],
    ["a", "b", "c", "d"],
    ["0", "1", "2", "3"],
    ["1", "2", "3", "4"],
    ["optionA", "optionB", "optionC", "optionD"],
    ["option_a", "option_b", "option_c", "option_d"],
    ["option1", "option2", "option3", "option4"],
    ["option_1", "option_2", "option_3", "option_4"],
    ["alternativeA", "alternativeB", "alternativeC", "alternativeD"],
    ["alternative_a", "alternative_b", "alternative_c", "alternative_d"],
    ["alternative1", "alternative2", "alternative3", "alternative4"],
    ["alternativaA", "alternativaB", "alternativaC", "alternativaD"],
    ["alternativa_a", "alternativa_b", "alternativa_c", "alternativa_d"],
    ["alternativa1", "alternativa2", "alternativa3", "alternativa4"],
    ["alternativa_1", "alternativa_2", "alternativa_3", "alternativa_4"],
  ];
  const keys = keySets.find((set) => set.every((key) => object[key] !== undefined)) ?? [];
  const values = keys.map((key) => object[key]).map(optionText);
  return values.length === 4 ? values : value;
}

function optionsDiagnostic(rawOptions: unknown, options: unknown) {
  if (Array.isArray(options)) {
    const itemTypes = options.map((option) => typeof option).join(",");
    return `options (array com ${options.length} itens: ${itemTypes})`;
  }
  if (rawOptions && typeof rawOptions === "object") return `options (objeto com chaves: ${Object.keys(rawOptions).join(", ")})`;
  return `options (tipo: ${rawOptions === null ? "null" : typeof rawOptions})`;
}

function correctOption(value: unknown, field: string) {
  if (typeof value === "string") {
    const letter = value.trim().toUpperCase().match(/^[ABCD]/)?.[0];
    if (letter) return letter.charCodeAt(0) - "A".charCodeAt(0);
    const number = Number(value);
    if (Number.isInteger(number)) value = number;
  }
  if (!Number.isInteger(value)) return value;
  if (field !== "correctOption" && Number(value) >= 1 && Number(value) <= 4) return Number(value) - 1;
  return Number(value);
}

export function parseSimulationQuestions(content: string, expected: number, fallbackSubjects: string[] = []) {
  const parsed = JSON.parse(cleanJson(content)) as { questions?: unknown } | unknown[];
  const questions = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "questions" in parsed ? parsed.questions : undefined;
  if (!Array.isArray(questions) || questions.length < expected) throw new Error(`Gemini retornou ${Array.isArray(questions) ? questions.length : 0} questões; eram esperadas ${expected}.`);

  const valid = questions.slice(0, expected).map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Questão ${index + 1} inválida.`);
    const question = item as Record<string, unknown>;
    const subject = question.subject ?? question.materia ?? question.topic ?? fallbackSubjects[index % fallbackSubjects.length];
    const statement = question.statement ?? question.question ?? question.enunciado;
    const rawOptions = question.options ?? question.opcoes ?? question.alternatives ?? question.choices ?? question.answers ?? question.alternativas ?? question.optionList;
    const options = optionList(rawOptions);
    const answerField = question.correctOption !== undefined ? "correctOption" : question.answer !== undefined ? "answer" : question.correctAnswer !== undefined ? "correctAnswer" : "respostaCorreta";
    const answerValue = question.correctOption ?? question.answer ?? question.correctAnswer ?? question.correct_answer ?? question.respostaCorreta ?? question.resposta_correta;
    const answer = correctOption(answerValue, answerField);
    const explanation = question.explanation ?? question.explicacao ?? question.rationale ?? question.justification;
    const difficulty = question.difficulty;
    if (typeof subject !== "string" || subject.trim().length < 2 || typeof statement !== "string" || statement.trim().length < 20 || !Array.isArray(options) || options.length !== 4 || !options.every((option) => typeof option === "string" && option.trim().length > 0) || !Number.isInteger(answer) || Number(answer) < 0 || Number(answer) > 3 || typeof explanation !== "string" || explanation.trim().length < 20) {
      const missing = [typeof subject !== "string" ? "subject" : "", typeof statement !== "string" ? "statement" : "", !Array.isArray(options) || options.length !== 4 || !options.every((option) => typeof option === "string" && option.trim().length > 0) ? optionsDiagnostic(rawOptions, options) : "", !Number.isInteger(answer) || Number(answer) < 0 || Number(answer) > 3 ? "correctOption" : "", typeof explanation !== "string" ? "explanation" : ""].filter(Boolean).join(", ");
      throw new Error(`Questão ${index + 1} retornada pelo Gemini está incompleta (${missing || "campos inválidos"}).`);
    }
    return {
      subject: subject.trim(),
      statement: statement.trim(),
      options: options.map((option) => option.trim()),
      correctOption: Number(answer),
      explanation: explanation.trim(),
      difficulty: difficulty === "EASY" || difficulty === "HARD" ? difficulty : "MEDIUM",
    } satisfies GeneratedSimulationQuestion;
  });

  const repeated = new Set<string>();
  for (const question of valid) {
    const key = question.statement.toLocaleLowerCase().replace(/\s+/g, " ");
    if (repeated.has(key)) throw new Error("Gemini retornou questões repetidas.");
    repeated.add(key);
  }
  return valid;
}

async function contextForSubjects(contestName: string, contestId: string, subjects: string[]) {
  const context = await Promise.all(subjects.map(async (subject) => {
    const [syllabus, questions] = await Promise.all([
      syllabusContext(contestName, subject, contestId).catch(() => ""),
      searchQuestions(`${contestName} · ${subject}`, 3).catch(() => []),
    ]);
    const rag = questions.map((question) => question.content).join("\n\n");
    return `MATÉRIA: ${subject}\n${syllabus ? `${syllabus}\n` : ""}${rag ? `QUESTÕES DE REFERÊNCIA:\n${rag}` : ""}`;
  }));
  return context.join("\n\n---\n\n").slice(0, 45_000);
}

export async function generateSimulationQuestions(contestName: string, examiningBoard: string, contestId: string, subjects: string[], quantity: number) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Defina GEMINI_API_KEY para gerar simulados.");
  const context = await contextForSubjects(contestName, contestId, subjects);
  const reference = context || "Não há conteúdo estruturado disponível. Gere questões apenas dentro do escopo explicitamente indicado pelas matérias e deixe de lado detalhes locais não confirmados.";
  const prompt = `Você é um elaborador experiente de provas para concursos públicos e vestibulares brasileiros. Gere exatamente ${quantity} questões objetivas inéditas para o concurso "${contestName}", cuja banca examinadora é "${examiningBoard}".

As questões devem respeitar rigorosamente as matérias selecionadas e o conteúdo programático de referência. Distribua as questões de maneira equilibrada entre as matérias. Imite o estilo, nível de dificuldade, extensão dos enunciados e tipo de cobrança da banca quando houver referências suficientes, sem copiar questões existentes. Se a banca ou o edital não estiverem disponíveis, não invente regras específicas.

Cada questão deve ser autossuficiente, sem depender de texto, imagem, tabela, gráfico ou questão anterior que não esteja reproduzido no próprio enunciado. Não crie alternativas ambíguas: deve existir uma única resposta correta. A explicação deve justificar a alternativa correta e apontar objetivamente o erro conceitual das demais quando isso for possível.

FORMATO DE SAÍDA OBRIGATÓRIO:
- Responda exclusivamente com um único objeto JSON válido.
- Não escreva Markdown nem bloco de código, comentários, introdução, conclusão ou qualquer texto antes ou depois do JSON.
- O objeto raiz deve conter somente a propriedade "questions".
- "questions" deve ser um array com exatamente ${quantity} itens.
- Cada item deve conter exatamente estas propriedades: "subject", "statement", "options", "correctOption", "explanation" e "difficulty".
- "subject", "statement" e "explanation" devem ser strings não vazias.
- "options" deve conter exatamente 4 strings não vazias, na ordem A, B, C e D.
- "correctOption" deve ser um número inteiro entre 0 e 3: 0=A, 1=B, 2=C, 3=D.
- "difficulty" deve ser exatamente "EASY", "MEDIUM" ou "HARD".
- Não adicione nenhuma propriedade além das especificadas.

Modelo exato da resposta (substitua os valores, mantendo a estrutura e os nomes dos campos):
{"questions":[{"subject":"Nome da matéria","statement":"Enunciado completo da questão.","options":["Alternativa A","Alternativa B","Alternativa C","Alternativa D"],"correctOption":0,"explanation":"Explicação completa da resposta correta.","difficulty":"MEDIUM"}]}

MATÉRIAS SELECIONADAS: ${subjects.join(", ")}

CONTEÚDO E QUESTÕES DE REFERÊNCIA:
${reference}`;
  const body = JSON.stringify({
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: Math.min(30_000, Math.max(7_000, quantity * 1_700)),
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          questions: {
            type: "ARRAY",
            minItems: quantity,
            maxItems: quantity,
            items: {
              type: "OBJECT",
              properties: {
                subject: { type: "STRING" },
                statement: { type: "STRING" },
                options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
                correctOption: { type: "INTEGER", minimum: 0, maximum: 3 },
                explanation: { type: "STRING" },
                difficulty: { type: "STRING", enum: ["EASY", "MEDIUM", "HARD"] },
              },
              required: ["subject", "statement", "options", "correctOption", "explanation", "difficulty"],
            },
          },
        },
        required: ["questions"],
      },
    },
    contents: [{ parts: [{ text: prompt }] }],
  });
  const generate = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body });
  const models = generationModels(env.GEMINI_GENERATION_MODEL);
  let response = await generate(models[0]);
  if (response.status === 404 && models[1]) response = await generate(models[1]);
  if (!response.ok) {
    const responseBody = await response.text();
    const retryAfterSeconds = Number(responseBody.match(/"retryDelay"\s*:\s*"(\d+)s"/)?.[1]);
    throw new GeminiGenerationError(`Gemini geração do simulado falhou (${response.status}): ${responseBody}`, response.status === 429 || response.status >= 500, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : undefined);
  }
  const responseBody = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = responseBody.candidates?.[0]?.content?.parts?.map(({ text }) => text ?? "").join("").trim();
  if (!content) throw new Error("Gemini não retornou questões para o simulado.");
  return parseSimulationQuestions(content, quantity, subjects).map((question, index) => ({ ...question, subject: subjects.includes(question.subject) ? question.subject : subjects[index % subjects.length] }));
}
