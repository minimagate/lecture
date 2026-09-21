import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { makeAppConfig, saveAppConfig, type AppConfig } from "../config/app-config.js";
import { validateCourseName } from "../config/courses.js";

const templateRoots = [
  new URL("../../templates/vault/", import.meta.url),
  new URL("../../../templates/vault/", import.meta.url),
];
const templateFiles = [
  ["README.md", "README.md"],
  ["AGENTS.md", "AGENTS.md"],
  ["skills/vault-structure/SKILL.md", ".agents/skills/vault-structure/SKILL.md"],
  ["skills/course-context/SKILL.md", ".agents/skills/course-context/SKILL.md"],
  ["skills/note-authoring/SKILL.md", ".agents/skills/note-authoring/SKILL.md"],
] as const;

const base = (course: string) => `filters: 'file.inFolder("_transcripts/${course.replace(/"/g, "\\\"")}") && file.ext == "md"'\nproperties:\n  date:\n    displayName: Date\n  title:\n    displayName: Lecture\n  summary:\n    displayName: Summary\nviews:\n  - type: table\n    name: Transcriptions\n    order:\n      - note.date\n      - note.title\n      - note.summary\n    sort:\n      - property: note.date\n        direction: DESC\n`;

async function writeIfMissing(filePath: string, contents: string): Promise<void> {
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(filePath, contents, "utf8");
  }
}

async function installTemplates(root: string): Promise<void> {
  const vaultName = path.basename(root) || "University";
  for (const [relativeTemplate, relativeDestination] of templateFiles) {
    let template: string | undefined;
    for (const templateRoot of templateRoots) {
      try {
        template = await readFile(new URL(relativeTemplate, templateRoot), "utf8");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (template === undefined) throw new Error(`Lecture templates are missing: ${relativeTemplate}`);
    const contents = template.replaceAll("{{VAULT_NAME}}", vaultName);
    await mkdir(path.dirname(path.join(root, relativeDestination)), { recursive: true });
    await writeIfMissing(path.join(root, relativeDestination), contents);
  }
}

async function updateJson(filePath: string, update: (value: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  let value: Record<string, unknown> = {};
  try { value = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>; } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(filePath, `${JSON.stringify(update(value), null, 2)}\n`, "utf8");
}

async function enableCorePlugin(filePath: string, plugin: string): Promise<void> {
  let value: unknown = [];
  try { value = JSON.parse(await readFile(filePath, "utf8")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const plugins = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  await writeFile(filePath, `${JSON.stringify(Array.from(new Set([...plugins, plugin])), null, 2)}\n`, "utf8");
}

export async function setupVault(vaultRoot: string, persist = true): Promise<AppConfig> {
  const root = path.resolve(vaultRoot);
  for (const directory of ["Notes", "_transcripts", "_audio", ".obsidian", ".agents/skills"]) await mkdir(path.join(root, directory), { recursive: true });
  await installTemplates(root);
  await updateJson(path.join(root, ".obsidian", "app.json"), (value) => ({ ...value, newFileLocation: value.newFileLocation ?? "folder", newFileFolderPath: value.newFileFolderPath ?? "Notes", userIgnoreFilters: Array.from(new Set([...(Array.isArray(value.userIgnoreFilters) ? value.userIgnoreFilters : []), "AGENTS.md", ".agents"])) }));
  await enableCorePlugin(path.join(root, ".obsidian", "core-plugins.json"), "bases");
  const config = makeAppConfig(root);
  if (persist) await saveAppConfig(config);
  return config;
}

export async function addCourse(vaultRoot: string, name: string): Promise<string> {
  const course = validateCourseName(name);
  const root = path.resolve(vaultRoot);
  for (const directory of [path.join("Notes", course), path.join("_transcripts", course), path.join("_audio", course)]) await mkdir(path.join(root, directory), { recursive: true });
  await writeIfMissing(path.join(root, "_transcripts", course, "Transcriptions.base"), base(course));
  return course;
}
