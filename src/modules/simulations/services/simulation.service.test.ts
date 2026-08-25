import { describe, expect, test } from "bun:test";
import { parseSimulationQuestions } from "./simulation.service";

const question = (position: number) => ({
  subject: "Português",
  statement: `Enunciado completo da questão número ${position}, com dados suficientes para responder.`,
  options: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
  correctOption: 1,
  explanation: "A alternativa correta aplica a regra apresentada no enunciado.",
  difficulty: "MEDIUM",
});

describe("parser de questões de simulado", () => {
  test("aceita JSON direto e remove Markdown de resposta", () => {
    const result = parseSimulationQuestions(`\`\`\`json\n${JSON.stringify([question(1)])}\n\`\`\``, 1);
    expect(result[0].correctOption).toBe(1);
    expect(result[0].options).toHaveLength(4);
  });

  test("aceita o formato envelopado e rejeita questões incompletas", () => {
    expect(parseSimulationQuestions(JSON.stringify({ questions: [question(1)] }), 1)).toHaveLength(1);
    expect(() => parseSimulationQuestions(JSON.stringify({ questions: [question(1), question(1)] }), 2)).toThrow("questões repetidas");
    expect(() => parseSimulationQuestions(JSON.stringify({ questions: [] }), 1)).toThrow("eram esperadas");
  });

  test("normaliza aliases comuns retornados pelo Gemini", () => {
    const result = parseSimulationQuestions(JSON.stringify({ questions: [{ materia: "Direito", question: question(1).statement, alternatives: { A: "Uma", B: "Duas", C: "Três", D: "Quatro" }, answer: "B", rationale: "A segunda alternativa aplica corretamente o conceito apresentado." }] }), 1, ["Direito"]);
    expect(result[0].subject).toBe("Direito");
    expect(result[0].correctOption).toBe(1);
  });

  test("normaliza alternativas nomeadas e objetos de texto", () => {
    const result = parseSimulationQuestions(JSON.stringify([{ subject: "História", statement: question(1).statement, options: { optionA: { text: "Uma" }, optionB: { label: "Duas" }, optionC: { content: "Três" }, optionD: { value: "Quatro" } }, correctOption: 2, explanation: "A terceira alternativa é a correta conforme o contexto." }]), 1);
    expect(result[0].options).toEqual(["Uma", "Duas", "Três", "Quatro"]);
  });

  test("aceita campos em português e alternativas numeradas", () => {
    const result = parseSimulationQuestions(JSON.stringify([{
      materia: "Português",
      enunciado: question(1).statement,
      opcoes: { alternativa_1: "Uma", alternativa_2: "Duas", alternativa_3: "Três", alternativa_4: "Quatro" },
      resposta_correta: 2,
      explicacao: "A segunda alternativa é a correta conforme a regra apresentada.",
    }]), 1);

    expect(result[0].options).toEqual(["Uma", "Duas", "Três", "Quatro"]);
    expect(result[0].correctOption).toBe(1);
  });
});
