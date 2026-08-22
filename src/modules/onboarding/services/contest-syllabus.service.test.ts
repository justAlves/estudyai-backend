import assert from "node:assert/strict";
import { matchingSyllabusKey } from "./contest-syllabus.service";

const candidates = [
  { key: "policiafederalagente", name: "Polícia Federal - Agente" },
  { key: "policiafederalescrivao", name: "Polícia Federal - Escrivão" },
  { key: "policiamilitardodistritofederalsoldado", name: "Polícia Militar do Distrito Federal - Soldado" },
  { key: "policiamilitardegoiasoldado", name: "Polícia Militar de Goiás - Soldado" },
  { key: "secretariadeeducacaodegoiasprofessor", name: "Secretaria de Educação de Goiás - Professor" },
  { key: "tribunaldejusticaestadualtecnico", name: "Tribunal de Justiça Estadual - Técnico" },
];

assert.equal(matchingSyllabusKey("Polícia Federal - Agente 2025", candidates), "policiafederalagente");
assert.equal(matchingSyllabusKey("Polícia Federal", candidates), undefined);
assert.equal(matchingSyllabusKey("PMDF Soldado", candidates), "policiamilitardodistritofederalsoldado");
assert.equal(matchingSyllabusKey("PMDFF Soldado", candidates), "policiamilitardodistritofederalsoldado");
assert.notEqual(matchingSyllabusKey("PMDF Soldado", candidates), "policiamilitardegoiasoldado");
assert.equal(matchingSyllabusKey("PMDF Soldado", candidates.filter(({ key }) => key !== "policiamilitardodistritofederalsoldado")), "policiamilitardegoiasoldado");
assert.equal(matchingSyllabusKey("SEDF Professor", candidates), "secretariadeeducacaodegoiasprofessor");
assert.equal(matchingSyllabusKey("TJDFT Técnico", candidates), "tribunaldejusticaestadualtecnico");
console.log("contest-syllabus:check passou");
