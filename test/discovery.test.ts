import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { discoverRecordings, discoverTranscripts } from "../src/files/discovery.js";
import type { AppConfig } from "../src/config/app-config.js";

async function fixture() {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "lecture-vault-"));
  await mkdir(path.join(vaultRoot, "_audio", "Analisi I", "Capitolo 2"), { recursive: true });
  await mkdir(path.join(vaultRoot, "_audio", "Algebra"), { recursive: true });
  await mkdir(path.join(vaultRoot, "_transcripts", "Algebra"), { recursive: true });
  await writeFile(path.join(vaultRoot, "_audio", "Analisi I", "2026-09-23 - Successioni.M4A"), "audio");
  await writeFile(path.join(vaultRoot, "_audio", "Analisi I", "Capitolo 2", "Lezione 04.wav"), "audio");
  await writeFile(path.join(vaultRoot, "_audio", "Algebra", "Recording.mp3"), "audio");
  await writeFile(path.join(vaultRoot, "_audio", "Algebra", "notes.txt"), "ignore");
  await writeFile(path.join(vaultRoot, "_transcripts", "Algebra", "renamed.md"), `---\ntype: transcript\nsource_audio: _audio/Algebra/Recording.mp3\nmetadata_status: complete\n---\n\n# Existing\n`);
  const config: AppConfig = { vaultRoot, transcriptionModel: "asr", metadataModel: "meta", language: "it" };
  return { config, vaultRoot };
}

test("discovers pending audio by source_audio metadata, not transcript filename", async () => {
  const { config } = await fixture();
  const pending = await discoverRecordings(config);
  assert.deepEqual(pending.map((job) => job.relativePath), [path.join("_audio", "Analisi I", "2026-09-23 - Successioni.M4A"), path.join("_audio", "Analisi I", "Capitolo 2", "Lezione 04.wav")]);
  assert.equal(pending[0].course, "Analisi I");
  assert.equal(pending[1].sourceAudio, "_audio/Analisi I/Capitolo 2/Lezione 04.wav");
});

test("deleting the transcript makes the source audio pending again", async () => {
  const { config, vaultRoot } = await fixture();
  const transcript = path.join(vaultRoot, "_transcripts", "Algebra", "renamed.md");
  const { unlink } = await import("node:fs/promises");
  await unlink(transcript);
  assert.equal((await discoverRecordings(config)).length, 3);
  assert.equal((await discoverTranscripts(config)).length, 0);
});
