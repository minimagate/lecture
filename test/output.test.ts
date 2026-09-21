import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { ensureNewOutput, formatDate, outputPath, parseDate, sanitizeFilename, validateAudioPath, validateInputAudio } from "../src/files/output.js";

test("formats local dates and rejects invalid calendar dates", () => {
  assert.equal(formatDate(new Date(2026, 8, 21)), "2026-09-21");
  assert.doesNotThrow(() => parseDate("2026-02-28"));
  assert.throws(() => parseDate("2026-02-29"), /Invalid date/);
});

test("sanitizes unsafe filename characters without losing Italian text", () => {
  assert.equal(sanitizeFilename('Limiti: perche? "speciali" / prova '), "Limiti- perche- -speciali- - prova");
});

test("creates output names and refuses duplicates", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lecture-test-"));
  const target = outputPath(directory, "2026-09-21", "Analisi dei limiti");
  await ensureNewOutput(target);
  await writeFile(target, "existing");
  await assert.rejects(ensureNewOutput(target), /Output already exists/);
});

test("accepts Voice Memos formats and rejects unsupported files", async () => {
  assert.equal(validateAudioPath("recording.M4A"), "m4a");
  assert.equal(validateAudioPath("recording.wav"), "wav");
  assert.throws(() => validateAudioPath("recording.pdf"), /Unsupported audio format/);
  await assert.rejects(validateInputAudio(path.join(os.tmpdir(), "does-not-exist.m4a")), /Input audio file not found/);
});
