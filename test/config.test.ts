import test from "node:test";
import assert from "node:assert/strict";
import { defaultVaultRoot, makeAppConfig } from "../src/config/app-config.js";
import { validateCourseName } from "../src/config/courses.js";

test("uses the platform default vault location and preserves course Unicode", () => {
  assert.match(defaultVaultRoot(), /Documents[\\/]University$/);
  assert.equal(validateCourseName("Analisi I"), "Analisi I");
  assert.equal(validateCourseName("Matematica à"), "Matematica à");
  assert.throws(() => validateCourseName("../outside"), /Invalid course name/);
  assert.equal(makeAppConfig("~/Documents/University").language, "it");
});
