import assert from "node:assert/strict";
import { weakSubjects } from "./adaptive-plan.service";

assert.deepEqual(weakSubjects([{ subject: "Português", score: 8, total: 10 }, { subject: "Matemática", score: 2, total: 10 }, { subject: "Matemática", score: 4, total: 10 }]), ["Matemática", "Português"]);
console.log("adaptive-plan:check passou");
