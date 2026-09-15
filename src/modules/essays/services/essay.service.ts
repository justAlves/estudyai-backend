import { env } from "../../../config/env";
import { GoogleGenAI } from "@google/genai";
import { apiLogger } from "../../../config/logger";
import type { EssayAnalysis } from "../../../database/tables/essays.table";
import { essayGenerationModels } from "../../study/services/material.service";
import { generateWithNim, nimConfigured } from "../../ai/services/nim.service";

function cleanJson(content: string) { return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); }

function validateAnalysis(value: unknown): EssayAnalysis {
  if (!value || typeof value !== "object") throw new Error("A IA retornou uma análise inválida.");
  const data = value as Record<string, unknown>;
  const competencies = data.competencies;
  if (!Array.isArray(competencies) || competencies.length !== 5 || typeof data.overallScore !== "number" || !Number.isFinite(data.overallScore)) throw new Error("A IA não retornou todas as competências da correção.");
  return {
    overallScore: Number(data.overallScore), summary: String(data.summary ?? ""),
    competencies: competencies.map((item) => { const c = item as Record<string, unknown>; return { name: String(c.name), score: Number(c.score), maxScore: Number(c.maxScore ?? 200), strengths: Array.isArray(c.strengths) ? c.strengths.map(String) : [], improvements: Array.isArray(c.improvements) ? c.improvements.map(String) : [] }; }),
    strengths: Array.isArray(data.strengths) ? data.strengths.map(String) : [], improvements: Array.isArray(data.improvements) ? data.improvements.map(String) : [], actionPlan: Array.isArray(data.actionPlan) ? data.actionPlan.map(String) : [],
  };
}

export async function analyzeEssay(topic: string, essayText: string, file?: File) {
  if (!env.GEMINI_API_KEY && !nimConfigured()) throw new Error("Defina NVIDIA_NIM_API_KEY ou GEMINI_API_KEY para corrigir redações.");
  const parts: Record<string, unknown>[] = [];
  if (essayText.trim()) parts.push({ text: `REDAÇÃO TRANSCRITA:\n${essayText}` });
  if (file) parts.push({ inlineData: { mimeType: file.type || "application/octet-stream", data: Buffer.from(await file.arrayBuffer()).toString("base64") } });
  const prompt = `Você é uma banca examinadora de redações em português brasileiro. Analise a redação enviada para o tema "${topic}". Corrija com rigor pedagógico, como uma banca, mas explique de modo que o estudante consiga melhorar. Use as cinco competências do ENEM como referência: domínio da norma padrão; compreensão do tema e do tipo textual; seleção e organização de argumentos; coesão; proposta de intervenção. Se o arquivo estiver ilegível, deixe isso explícito nos pontos de melhoria.\n\nResponda exclusivamente JSON no formato: {"overallScore":0,"summary":"...","competencies":[{"name":"Competência 1","score":0,"maxScore":200,"strengths":["..."],"improvements":["..."]}],"strengths":["..."],"improvements":["..."],"actionPlan":["..."]}. Cada score deve ser de 0 a 200 e overallScore a soma. Não invente trechos que não estejam na redação. Seja específico, citando pequenos fragmentos apenas quando necessário.`;
  if (!file && nimConfigured()) {
    try {
      return validateAnalysis(JSON.parse(cleanJson(await generateWithNim({ prompt: `${prompt}\n\nREDAÇÃO TRANSCRITA:\n${essayText}`, maxTokens: 8_000, temperature: 0.2, json: true }))));
    } catch {
      // Gemini remains the provider fallback when NIM fails or returns invalid JSON.
    }
  }
  if (!env.GEMINI_API_KEY) throw new Error("NIM falhou e GEMINI_API_KEY não está configurada para fallback.");
  parts.unshift({ text: prompt });
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const models = essayGenerationModels(env.GEMINI_GENERATION_MODEL);
  let response;
  let lastError: unknown;
  for (const model of models) {
    try { response = await ai.models.generateContent({ model, contents: [{ role: "user", parts }], config: { temperature: 0.2, maxOutputTokens: 8_000, responseMimeType: "application/json" } }); break; }
    catch (error) { lastError = error; }
  }
  if (!response) throw lastError instanceof Error ? lastError : new Error("Nenhum modelo Gemini conseguiu corrigir a redação.");
  const content = response.text;
  if (!content) throw new Error("A IA não retornou uma correção.");
  return validateAnalysis(JSON.parse(cleanJson(content)));
}

export async function suggestEssayTopic() {
  if (!env.GEMINI_API_KEY && !nimConfigured()) throw new Error("Defina NVIDIA_NIM_API_KEY ou GEMINI_API_KEY para sugerir temas.");
  const models = essayGenerationModels(env.GEMINI_GENERATION_MODEL);
  const contents = "Gere um único tema atual e relevante para uma redação dissertativo-argumentativa brasileira, com no máximo 180 caracteres. Retorne exclusivamente JSON válido no formato {\"topic\":\"enunciado completo do tema\"}. Não inclua Markdown, explicações ou texto antes/depois do JSON.";
  if (nimConfigured()) {
    try {
      const raw = await generateWithNim({ prompt: contents, maxTokens: 512, temperature: 0.8, json: true });
      const parsed = JSON.parse(cleanJson(raw)) as { topic?: unknown };
      if (typeof parsed.topic === "string" && isUsableEssayTopic(parsed.topic)) return parsed.topic.trim();
      throw new Error("NIM retornou tema inválido.");
    } catch {
      // Gemini remains the provider fallback when NIM fails or returns an invalid topic.
    }
  }
  if (!env.GEMINI_API_KEY) throw new Error("NIM falhou e GEMINI_API_KEY não está configurada para fallback.");
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const topicConfig = { temperature: 0.8, maxOutputTokens: 2_048, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { topic: { type: "STRING" } }, required: ["topic"] } } as const;
  let response;
  try { response = await ai.models.generateContent({ model: models[0], contents, config: topicConfig }); }
  catch (error) { if (!models[1]) throw error; response = await ai.models.generateContent({ model: models[1], contents, config: topicConfig }); }
  const rawTopic = response.text?.trim() ?? "";
  apiLogger.warn({ model: models[0], rawTopic: rawTopic.slice(0, 2_000), rawTopicLength: rawTopic.length }, "retorno bruto do Gemini para sugestão de tema");
  let topic = "";
  try {
    const jsonStart = rawTopic.indexOf("{");
    const jsonEnd = rawTopic.lastIndexOf("}");
    const candidate = jsonStart >= 0 && jsonEnd > jsonStart ? rawTopic.slice(jsonStart, jsonEnd + 1) : rawTopic;
    const parsed = JSON.parse(candidate) as { topic?: unknown };
    topic = typeof parsed.topic === "string" ? parsed.topic.trim() : "";
  } catch {
    topic = rawTopic.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").replace(/^here is (?:the )?(?:json|topic) requested:\s*/i, "").replace(/^['"“”]+|['"“”]+$/g, "").trim();
  }
  apiLogger.warn({ extractedTopic: topic.slice(0, 500), extractedTopicLength: topic.length, valid: !!topic && isUsableEssayTopic(topic) }, "tema extraído do retorno do Gemini");
  if (!topic || !isUsableEssayTopic(topic)) throw new Error("A IA retornou um tema inválido.");
  return topic;
}

export function isUsableEssayTopic(topic: string) {
  const normalized = topic.trim().toLocaleLowerCase();
  return topic.trim().length >= 25 && topic.trim().length <= 300 && !/[{}\[\]]/.test(topic) && !/(respond|json|style|assistant|system|markdown)/i.test(normalized);
}
