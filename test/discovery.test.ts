import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { discoverAllRecordings, discoverRecordings } from "../src/files/discovery.js";
import type { CourseConfig } from "../src/config/courses.js";

async function fixture() {
  const universityRoot = await mkdtemp(path.join(os.tmpdir(), "lecture-university-"));
  const audioRoot = path.join(universityRoot, "_audio");
  await mkdir(path.join(audioRoot, "Analisi I", "Capitolo 2"), { recursive: true });
  await mkdir(path.join(audioRoot, "Algebra"), { recursive: true });
  await writeFile(path.join(audioRoot, "Analisi I", "2026-09-23 - Successioni.M4A"), "audio");
  await writeFile(path.join(audioRoot, "Analisi I", "Capitolo 2", "Lezione 04.wav"), "audio");
  await writeFile(path.join(audioRoot, "Algebra", "spazi.mp3"), "audio");
  await writeFile(path.join(audioRoot, "Algebra", "already.md"), "done");
  await writeFile(path.join(audioRoot, "Algebra", "already.m4a"), "audio");
  await writeFile(path.join(audioRoot, "notes.txt"), "ignore");
  await writeFile(path.join(audioRoot, ".DS_Store"), "ignore");
  const config: CourseConfig = { courses: {}, universityRoot, audioDirectory: "_audio" };
  return { config, universityRoot };
}

test("discovers supported recordings, mirrors nested paths, and sorts deterministically", async () => {
  const { config } = await fixture();
  const all = await discoverAllRecordings(config);
  assert.deepEqual(all.map((job) => job.relativePath), [
    "Algebra/already.m4a",
    "Algebra/spazi.mp3",
    path.join("Analisi I", "2026-09-23 - Successioni.M4A"),
    path.join("Analisi I", "Capitolo 2", "Lezione 04.wav"),
  ]);
  const nested = all.find((job) => job.title === "Lezione 04");
  assert.equal(nested?.transcriptPath, path.join(config.universityRoot, "Analisi I", "Capitolo 2", "Lezione 04.md"));
  assert.equal(all.find((job) => job.relativePath.includes("Successioni"))?.title, "Successioni");
  assert.equal(all.find((job) => job.title === "already")?.transcribed, false);
});

test("pending discovery excludes recordings whose mirrored transcript exists", async () => {
  const { config, universityRoot } = await fixture();
  await mkdir(path.join(universityRoot, "Algebra"), { recursive: true });
  await writeFile(path.join(universityRoot, "Algebra", "already.md"), "done");
  const pending = await discoverRecordings(config);
  assert.deepEqual(pending.map((job) => job.relativePath), ["Algebra/spazi.mp3", path.join("Analisi I", "2026-09-23 - Successioni.M4A"), path.join("Analisi I", "Capitolo 2", "Lezione 04.wav")]);
});
