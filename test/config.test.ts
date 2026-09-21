import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadCourseConfig, resolveCourse } from "../src/config/courses.js";

test("loads YAML courses and expands home paths", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lecture-config-"));
  const file = path.join(directory, "config.yaml");
  await writeFile(file, "courses:\n  analisi:\n    name: Analisi I\n    path: ~/Documents/University/Analisi I\n");
  const config = await loadCourseConfig(file);
  assert.equal(config.courses.analisi.name, "Analisi I");
  assert.equal(config.courses.analisi.path, path.join(os.homedir(), "Documents/University/Analisi I"));
  assert.equal(resolveCourse(config, "analisi").name, "Analisi I");
  assert.throws(() => resolveCourse(config, "missing"), /Unknown course "missing"/);
});
