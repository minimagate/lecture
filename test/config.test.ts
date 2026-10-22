import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { DEFAULT_TEACHING_MODEL, defaultVaultRoot, makeAppConfig } from "../src/config/app-config.js";
import { validateCourseName } from "../src/config/courses.js";

test("uses the platform default vault location and preserves course Unicode", () => {
  if (process.platform === "darwin") assert.equal(defaultVaultRoot(), path.join(os.homedir(), "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents", "University"));
  else assert.match(defaultVaultRoot(), /Documents[\\/]University$/);
  assert.equal(validateCourseName("Analisi I"), "Analisi I");
  assert.equal(validateCourseName("Matematica à"), "Matematica à");
  assert.throws(() => validateCourseName("../outside"), /Invalid course name/);
  assert.equal(makeAppConfig("~/Documents/University").language, "it");
  assert.equal(makeAppConfig("~/Documents/University").teachingModel, "anthropic/claude-opus-5.5");
  assert.equal(DEFAULT_TEACHING_MODEL, "anthropic/claude-opus-5.5");
});
