import assert from "node:assert/strict";
import assert from "node:assert/strict";
import { adaptiveResultsWithinPlan, weakSubjects } from "./adaptive-plan.service";

assert.deepEqual(weakSubjects([{ subject: "Português", score: 8, total: 10 }, { subject: "Matemática", score: 2, total: 10 }, { subject: "Matemática", score: 4, total: 10 }]), ["Matemática", "Português"]);
assert.deepEqual(adaptiveResultsWithinPlan(["Português", "Matemática"], [
  { subject: "Matemática", score: 2, total: 10 },
  { subject: "Conteúdo de outro concurso", score: 10, total: 10 },
]), [{ subject: "Matemática", score: 2, total: 10 }]);
console.log("adaptive-plan:check passou");
