import test from "node:test";
import assert from "node:assert/strict";
import { parseResponse } from "../src/transcription/openrouter.js";

test("parses transcript and optional usage cost from OpenRouter", () => {
  const result = parseResponse({ model: "provider/model", choices: [{ message: { content: "  Oggi iniziamo.  " } }], usage: { cost: 0.0123 } });
  assert.deepEqual(result, { text: "Oggi iniziamo.", model: "provider/model", cost: 0.0123 });
});

test("rejects malformed or empty OpenRouter responses", () => {
  assert.throws(() => parseResponse({ choices: [] }), /no transcript text/);
  assert.throws(() => parseResponse({ choices: [{ message: { content: null } }] }), /no transcript text/);
});
