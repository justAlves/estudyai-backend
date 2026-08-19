import { strict as assert } from "node:assert";
import { vectorLiteral } from "./rag.service";

assert.equal(vectorLiteral([0.1, -0.2]), "[0.1,-0.2]");
console.info("rag:search:check passou");
