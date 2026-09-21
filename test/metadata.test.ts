import test from "node:test";
import assert from "node:assert/strict";
import { parseLectureMetadata, METADATA_SCHEMA } from "../src/metadata/openrouter.js";

test("parses structured title and summary metadata", () => {
  const result = parseLectureMetadata({ choices: [{ message: { content: JSON.stringify({ title: "Limiti di successioni", summary: "La lezione introduce il limite di una successione." }) } }], usage: { cost: 0.001 } });
  assert.deepEqual(result, { title: "Limiti di successioni", summary: "La lezione introduce il limite di una successione.", cost: 0.001 });
  assert.equal(METADATA_SCHEMA.required.join(","), "title,summary");
});

test("rejects malformed metadata responses", () => {
  assert.throws(() => parseLectureMetadata({ choices: [{ message: { content: "{}" } }] }), /incomplete/);
  assert.throws(() => parseLectureMetadata({ choices: [{ message: { content: "not json" } }] }), /invalid metadata JSON/);
});
