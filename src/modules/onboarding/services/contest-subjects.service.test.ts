import { expect, test } from "bun:test";
import { searchContestCandidates } from "./contest-subjects.service";

const candidates = [
  { name: "Polícia Militar do Distrito Federal - Soldado", examiningBoard: "Cebraspe" },
  { name: "Polícia Militar de Goiás - Soldado", examiningBoard: "IBFC" },
  { name: "Tribunal de Justiça de São Paulo - Técnico", examiningBoard: "Vunesp" },
];

test("encontra concursos por nome parcial e sigla", () => {
  expect(searchContestCandidates("PM", candidates)[0]?.name).toContain("Polícia Militar");
  expect(searchContestCandidates("PMDF", candidates)[0]?.name).toContain("Distrito Federal");
  expect(searchContestCandidates("TJSP", candidates)[0]?.name).toContain("São Paulo");
});
