import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { addCourse, setupVault } from "../src/vault/setup.js";

test("setup creates an idempotent vault and course structure without clobbering files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lecture-setup-"));
  await setupVault(root, false);
  await addCourse(root, "Analisi I");
  const agentsPath = path.join(root, "AGENTS.md");
  const custom = "custom instructions\n";
  await writeFile(agentsPath, custom);
  await setupVault(root, false);
  assert.equal(await readFile(agentsPath, "utf8"), custom);
  for (const file of ["README.md", "AGENTS.md", ".agents/skills/vault-structure/SKILL.md", ".agents/skills/course-context/SKILL.md", ".agents/skills/note-authoring/SKILL.md", "_transcripts/Analisi I/Transcriptions.base", "_audio/Analisi I", ".obsidian/app.json"]) await access(path.join(root, file));
  await assert.rejects(access(path.join(root, "Notes", "Analisi I", "Transcriptions.base")));
});

test("setup writes authored templates with the vault name and no unresolved placeholders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lecture-templates-"));
  await setupVault(root, false);
  const files = ["README.md", "AGENTS.md", ".agents/skills/vault-structure/SKILL.md", ".agents/skills/course-context/SKILL.md", ".agents/skills/note-authoring/SKILL.md"];
  for (const file of files) {
    const content = await readFile(path.join(root, file), "utf8");
    assert.match(content, /generated-by: lecture/);
    assert.doesNotMatch(content, /\{\{[^}]+\}\}/);
    assert.match(content, /Notes\//);
    assert.match(content, /_transcripts\//);
  }
  const generated = await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")));
  assert.match(generated.join("\n"), /_audio\//);
  const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
  for (const field of ["type", "course", "date", "title", "summary", "source_audio", "duration_seconds", "transcription_model", "metadata_model", "metadata_status", "transcribed_at"]) assert.match(agents, new RegExp(`\\b${field}\\b`));
  assert.match(await readFile(path.join(root, "README.md"), "utf8"), new RegExp(path.basename(root)));
  const app = JSON.parse(await readFile(path.join(root, ".obsidian/app.json"), "utf8")) as { userIgnoreFilters: string[] };
  assert.deepEqual(app.userIgnoreFilters.sort(), [".agents", "AGENTS.md"]);
});

test("setup never overwrites a manually edited generated file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lecture-owned-"));
  await setupVault(root, false);
  const readmePath = path.join(root, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, `${readme}\nA personal addition.\n`);
  await setupVault(root, false);
  assert.match(await readFile(readmePath, "utf8"), /A personal addition/);
});

test("setup installs documentation without making network calls", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lecture-offline-"));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("setup must not call fetch");
  }) as typeof fetch;
  try {
    await setupVault(root, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
});

test("course names reject path traversal and preserve accents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lecture-course-"));
  await assert.rejects(addCourse(root, "../outside"), /Invalid course name/);
  assert.equal(await addCourse(root, "Fisica à"), "Fisica à");
});
