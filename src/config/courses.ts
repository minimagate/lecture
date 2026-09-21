import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

export type Course = { name: string; path: string };
export type CourseConfig = { courses: Record<string, Course>; universityRoot: string; audioDirectory: string };

export function defaultConfigPath(): string {
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "lecture", "config.yaml");
}

export function expandHome(value: string): string {
  return value === "~" ? os.homedir() : value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export async function loadCourseConfig(filePath = process.env.LECTURE_CONFIG_FILE ?? defaultConfigPath()): Promise<CourseConfig> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Course configuration not found at ${filePath}. Create it with a courses section; see the README.`);
    }
    throw error;
  }

  const parsed = YAML.parse(source) as unknown;
  if (!parsed || typeof parsed !== "object" || !("courses" in parsed) || !parsed.courses || typeof parsed.courses !== "object") {
    throw new Error(`Invalid course configuration at ${filePath}: expected a top-level courses mapping.`);
  }

  const courses: Record<string, Course> = {};
  for (const [alias, value] of Object.entries(parsed.courses as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).name !== "string" || typeof (value as Record<string, unknown>).path !== "string") {
      throw new Error(`Invalid course "${alias}": each course needs a name and path.`);
    }
    courses[alias] = { name: (value as Course).name, path: expandHome((value as Course).path) };
  }
  const document = parsed as Record<string, unknown>;
  const universityRoot = typeof document.universityRoot === "string" ? expandHome(document.universityRoot) : path.join(os.homedir(), "Documents", "University");
  const audioDirectory = typeof document.audioDirectory === "string" && document.audioDirectory.trim() ? document.audioDirectory : "_audio";
  if (path.isAbsolute(audioDirectory) || audioDirectory.split(path.sep).includes("..")) throw new Error("Invalid audioDirectory: it must be a relative directory inside universityRoot.");
  return { courses, universityRoot, audioDirectory };
}

export function resolveCourse(config: CourseConfig, alias: string): Course {
  const course = config.courses[alias];
  if (!course) {
    const available = Object.keys(config.courses).sort();
    throw new Error(`Unknown course "${alias}".\n\nAvailable courses:\n${available.map((name) => `  ${name}`).join("\n")}`);
  }
  return course;
}
