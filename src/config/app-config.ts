import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export type AppConfig = {
  vaultRoot: string;
  transcriptionModel: string;
  metadataModel: string;
  teachingModel?: string;
  language: string;
};

export const DEFAULT_TRANSCRIPTION_MODEL = "openai/whisper-large-v3-turbo";
export const DEFAULT_METADATA_MODEL = "openai/gpt-5.6-luna";
export const DEFAULT_TEACHING_MODEL = "openai/gpt-5.6-luna";

export function expandHome(value: string): string {
  return value === "~" ? os.homedir() : value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export function defaultVaultRoot(): string {
  return path.join(os.homedir(), "Documents", "University");
}

export function appConfigPath(): string {
  if (process.env.LECTURE_CONFIG_FILE) return path.resolve(expandHome(process.env.LECTURE_CONFIG_FILE));
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "lecture", "config.json");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "lecture", "config.json");
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "lecture", "config.json");
}

export function makeAppConfig(vaultRoot: string): AppConfig {
  return { vaultRoot: path.resolve(expandHome(vaultRoot)), transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL, metadataModel: DEFAULT_METADATA_MODEL, teachingModel: DEFAULT_TEACHING_MODEL, language: "it" };
}

export async function loadAppConfig(): Promise<AppConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(appConfigPath(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Lecture is not set up yet. Run `lecture setup` first.");
    throw new Error(`Could not read ${appConfigPath()}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || typeof (parsed as Record<string, unknown>).vaultRoot !== "string") throw new Error(`Invalid Lecture configuration at ${appConfigPath()}. Run lecture setup again only after checking your existing config.`);
  const value = parsed as Partial<AppConfig>;
  const vaultRoot = typeof value.vaultRoot === "string" ? value.vaultRoot : "";
  return { vaultRoot: path.resolve(expandHome(vaultRoot)), transcriptionModel: value.transcriptionModel ?? DEFAULT_TRANSCRIPTION_MODEL, metadataModel: value.metadataModel ?? DEFAULT_METADATA_MODEL, teachingModel: value.teachingModel ?? DEFAULT_TEACHING_MODEL, language: value.language ?? "it" };
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  await mkdir(path.dirname(appConfigPath()), { recursive: true });
  await writeFile(appConfigPath(), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
