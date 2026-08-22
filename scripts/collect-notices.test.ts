import assert from "node:assert/strict";
import { curriculumExcerpt, geminiWaitMs, noticeDocumentScore, parseNoticeSubjects } from "./collect-notices";

assert.deepEqual(parseNoticeSubjects('{"subjects":["Língua Portuguesa","Informática","Lingua Portuguesa"]}'), ["Língua Portuguesa", "Informática"]);
assert.deepEqual(parseNoticeSubjects('```JSON\n{"disciplinas":[{"name":"Direito Penal"}]}\n```'), ["Direito Penal"]);
assert.deepEqual(parseNoticeSubjects('["Informática"]'), ["Informática"]);
assert.throws(() => parseNoticeSubjects('{"subjects":[]}'), /Resposta da IA: \{"subjects":\[\]\}/);
assert.throws(() => parseNoticeSubjects("não é JSON"), /A IA não retornou JSON válido/);
assert.ok(noticeDocumentScore("Edital de abertura") > noticeDocumentScore("Edital de retificação"));
assert.match(curriculumExcerpt("capa\nCONTEÚDO PROGRAMÁTICO\nDireito Constitucional"), /Direito Constitucional/);
assert.equal(geminiWaitMs(10_000, 20_000), 50_000);
assert.equal(geminiWaitMs(10_000, 80_000), 0);
console.log("collect:notices:check passou");
