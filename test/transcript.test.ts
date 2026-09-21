import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { processRecording } from "../src/vault/transcripts.js";
import type { AppConfig } from "../src/config/app-config.js";
import type { RecordingJob } from "../src/files/discovery.js";

test("metadata failure preserves the successful transcript as pending", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "lecture-transcript-"));
  const input = path.join(vaultRoot, "recording.m4a");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(input, "audio");
  const config: AppConfig = { vaultRoot, transcriptionModel: "asr", metadataModel: "meta", language: "it" };
  const job: RecordingJob = { audioPath: input, sourceAudio: "_audio/Analisi I/Recording 127.m4a", relativePath: "_audio/Analisi I/Recording 127.m4a", course: "Analisi I", stem: "Recording 127", birthtimeMs: 0, mtimeMs: Date.now() };
  const result = await processRecording(job, config, "key", {
    transcribe: async () => ({ text: "Oggi studiamo i limiti.", model: "asr", duration: 42, chunked: false }),
    generateMetadata: async () => { throw new Error("metadata unavailable"); },
  });
  const content = await readFile(result.transcriptPath, "utf8");
  assert.equal(result.metadataPending, true);
  assert.match(content, /metadata_status: pending/);
  assert.match(content, /source_audio: _audio\/Analisi I\/Recording 127\.m4a/);
  assert.match(content, /Oggi studiamo i limiti/);
});
