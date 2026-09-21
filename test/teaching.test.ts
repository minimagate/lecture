import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseMarkdown, stringifyFrontmatter } from "../src/markdown/frontmatter.js";
import { inspectTeaching, teachTranscripts } from "../src/teaching/index.js";
import { sourceHash } from "../src/teaching/hash.js";
import type { AppConfig } from "../src/config/app-config.js";

function config(vaultRoot: string): AppConfig { return { vaultRoot, transcriptionModel: "transcription", metadataModel: "metadata", language: "it", teachingModel: "teaching" }; }

async function fixture(): Promise<{ root: string; transcript: string; app: AppConfig }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "lecture-teaching-"));
  const transcript = path.join(root, "_transcripts", "Analisi I", "renamed-source.md");
  await mkdir(path.dirname(transcript), { recursive: true });
  const body = "# Limiti\n\n## Summary\n\nUna lezione.\n\n## Transcript\n\nDefinizione: una successione converge se...\n\nIl professore osserva un errore comune.\n";
  await writeFile(transcript, stringifyFrontmatter({ type: "transcript", course: "Analisi I", date: "2026-09-21", title: "Limiti di successioni", metadata_status: "complete", source_audio: "_audio/Analisi I/a.m4a" }, body), "utf8");
  return { root, transcript, app: config(root) };
}

test("discovers a completed transcript as pending and normalizes its source path", async () => {
  const { app, transcript } = await fixture();
  const report = await inspectTeaching(app);
  assert.equal(report.pending.length, 1);
  assert.equal(report.pending[0].source, "_transcripts/Analisi I/renamed-source.md");
  assert.equal(report.pending[0].hash, sourceHash("Definizione: una successione converge se...\n\nIl professore osserva un errore comune."));
});

test("uses source_transcript identity rather than the note filename and writes valid metadata", async () => {
  const { app, transcript } = await fixture();
  const note = path.join(app.vaultRoot, "Notes", "Analisi I", "Lectures", "completely-different-name.md");
  const source = "_transcripts/Analisi I/renamed-source.md";
  await mkdir(path.dirname(note), { recursive: true });
  await writeFile(note, stringifyFrontmatter({ type: "lecture-note", source_transcript: source, source_hash: sourceHash("Definizione: una successione converge se...\n\nIl professore osserva un errore comune.") }, "# Existing"), "utf8");
  const report = await inspectTeaching(app);
  assert.equal(report.pending.length, 0);
  assert.equal(report.candidates[0].notePath, note);
  await access(transcript);
});

test("generates atomically, preserves the transcript, and skips unchanged sources", async () => {
  const { app, transcript } = await fixture();
  const before = await readFile(transcript, "utf8");
  let calls = 0;
  const generate = async (prompt: string) => { calls++; assert.match(prompt, /Definizione: una successione/); assert.doesNotMatch(prompt, /source_audio|metadata_status/); return { body: "# Limiti di successioni\n\n## Definizione\n\nDettagli." }; };
  const first = await teachTranscripts(app, { apiKey: "test", generate });
  assert.equal(first.created, 1);
  assert.equal(calls, 1);
  assert.equal(await readFile(transcript, "utf8"), before);
  const notePath = path.join(app.vaultRoot, "Notes", "Analisi I", "Lectures", "2026-09-21 - Limiti di successioni.md");
  const parsed = parseMarkdown(await readFile(notePath, "utf8"));
  assert.equal(parsed.frontmatter.source_transcript, "_transcripts/Analisi I/renamed-source.md");
  assert.equal(parsed.frontmatter.source_hash, sourceHash("Definizione: una successione converge se...\n\nIl professore osserva un errore comune."));
  const second = await teachTranscripts(app, { apiKey: "test", generate });
  assert.equal(second.created, 0);
  assert.equal(calls, 1);
});

test("reports stale notes, leaves them unchanged, and force regenerates", async () => {
  const { app } = await fixture();
  let calls = 0;
  const generate = async () => { calls++; return { body: `# Generated ${calls}` }; };
  await teachTranscripts(app, { apiKey: "test", generate });
  const transcript = path.join(app.vaultRoot, "_transcripts", "Analisi I", "renamed-source.md");
  await writeFile(transcript, `${await readFile(transcript, "utf8")}\nNuovo teorema.\n`, "utf8");
  const stale = await inspectTeaching(app);
  assert.equal(stale.stale.length, 1);
  const notePath = path.join(app.vaultRoot, "Notes", "Analisi I", "Lectures", "2026-09-21 - Limiti di successioni.md");
  const oldNote = await readFile(notePath, "utf8");
  const normal = await teachTranscripts(app, { apiKey: "test", generate });
  assert.equal(normal.created, 0);
  assert.equal(await readFile(notePath, "utf8"), oldNote);
  const forced = await teachTranscripts(app, { apiKey: "test", force: true, generate });
  assert.equal(forced.created, 1);
  assert.equal(calls, 2);
  assert.match(await readFile(notePath, "utf8"), /Generated 2/);
});

test("continues after a failed teaching request without creating its final note", async () => {
  const first = await fixture();
  const secondTranscript = path.join(first.root, "_transcripts", "Algebra", "second.md");
  await mkdir(path.dirname(secondTranscript), { recursive: true });
  await writeFile(secondTranscript, stringifyFrontmatter({ type: "transcript", course: "Algebra", date: "2026-09-22", title: "Applicazioni lineari", metadata_status: "complete", source_audio: "_audio/Algebra/second.m4a" }, "## Transcript\n\nUna seconda lezione."), "utf8");
  let calls = 0;
  const result = await teachTranscripts(first.app, { apiKey: "test", generate: async () => { calls++; if (calls === 1) throw new Error("failed"); return { body: "# Works" }; } });
  assert.equal(result.failed.length, 1);
  assert.equal(result.created, 1);
  await assert.rejects(access(path.join(first.root, "Notes", "Algebra", "Lectures", "2026-09-22 - Applicazioni lineari.md")));
  await access(path.join(first.root, "Notes", "Analisi I", "Lectures", "2026-09-21 - Limiti di successioni.md"));
});
