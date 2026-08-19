import { strict as assert } from "node:assert";
import { activityScore, generationModels, materialRetryDelayMs, parseActivities, sourceList } from "./material.service";

assert.equal(sourceList([{ content: "x", source: "inep", sourceUrl: "https://example.com", eventDate: "2025-01-01", questionNumber: 1, similarity: 0.9 }, { content: "y", source: "inep", sourceUrl: "https://example.com", eventDate: "2025-01-01", questionNumber: 2, similarity: 0.8 }]).length, 1);
assert.deepEqual(generationModels("gemini-2.5-flash"), ["gemini-2.5-flash", "gemini-3.6-flash"]);
assert.deepEqual([1, 2, 3, 4, 5].map(materialRetryDelayMs), [15_000, 30_000, 60_000, 120_000, 240_000]);
assert.equal(parseActivities('[{"question":"x","options":["a","b","c","d"],"answer":0,"explanation":"x"}]')[0].answer, 0);
assert.equal(activityScore(parseActivities('[{"question":"x","options":["a","b","c","d"],"answer":0,"explanation":"x"}]'), [0]), 1);
console.info("study:check passou");
