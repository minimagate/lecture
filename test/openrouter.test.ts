import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseResponse, transcribeAudio } from "../src/transcription/openrouter.js";

test("parses transcript and optional usage cost from OpenRouter", () => {
  const result = parseResponse({ model: "provider/model", choices: [{ message: { content: "  Oggi iniziamo.  " } }], usage: { cost: 0.0123 } });
  assert.deepEqual(result, { text: "Oggi iniziamo.", model: "provider/model", cost: 0.0123 });
});

test("rejects malformed or empty OpenRouter responses", () => {
  assert.throws(() => parseResponse({ choices: [] }), /no transcript text/);
  assert.throws(() => parseResponse({ choices: [{ message: { content: null } }] }), /no transcript text/);
});

test("sends Whisper audio to the transcription endpoint as multipart form data", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lecture-openrouter-"));
  const audioPath = path.join(directory, "lecture.m4a");
  await writeFile(audioPath, "fake audio");
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = (async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ text: "  Trascrizione.  ", model: "openai/whisper-large-v3-turbo", usage: { cost: 0.01 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await transcribeAudio(audioPath, "m4a", "openai/whisper-large-v3-turbo", "it", "test-key");
    assert.deepEqual(result, { text: "Trascrizione.", model: "openai/whisper-large-v3-turbo", cost: 0.01 });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(request?.url, "https://openrouter.ai/api/v1/audio/transcriptions");
  assert.equal(request?.method, "POST");
  const form = await request?.formData();
  assert.equal(form?.get("model"), "openai/whisper-large-v3-turbo");
  assert.equal(form?.get("language"), "it");
  assert.equal((form?.get("file") as File)?.name, "lecture.m4a");
});
