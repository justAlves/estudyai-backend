import { strict as assert } from "node:assert";
import { candidateFrom, normalizeQuestion, retryDelayMs } from "./rag-ingestion.worker";

assert.equal(normalizeQuestion(" Questão\n  1 "), "Questão 1");
assert.equal(candidateFrom({ number: 1, text: "Questão 1" }, { source: "inep", kind: "exam", eventDate: "2025-01-01", sourceUrl: "https://example.com/prova.pdf", sha256: "a".repeat(64) })?.contentHash.length, 64);
assert.equal(retryDelayMs('{"retryDelay":"54.2s"}'), 54_200);
console.info("rag:check passou");
