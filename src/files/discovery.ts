import path from "node:path";
import { access, lstat, readdir, readFile, stat } from "node:fs/promises";
import type { AppConfig } from "../config/app-config.js";
import { parseMarkdown, vaultRelativePath } from "../markdown/frontmatter.js";

const audioExtensions = new Set([".m4a", ".mp3", ".wav", ".aac", ".aiff", ".ogg", ".flac", ".mp4", ".webm"]);

export type TranscriptRecord = { path: string; frontmatter: Record<string, unknown>; body: string };
export type RecordingJob = { audioPath: string; sourceAudio: string; relativePath: string; course: string; stem: string; date?: string; birthtimeMs: number; mtimeMs: number };

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function walk(root: string, current: string, result: string[], extensions: Set<string>): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.endsWith(".tmp")) continue;
    const entryPath = path.join(current, entry.name);
    const details = await lstat(entryPath);
    if (details.isSymbolicLink()) continue;
    if (details.isDirectory()) await walk(root, entryPath, result, extensions);
    else if (details.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) result.push(entryPath);
  }
}

async function scanAudio(config: AppConfig): Promise<string[]> {
  const root = path.resolve(config.vaultRoot);
  const audioRoot = path.resolve(root, "_audio");
  if (!isWithin(root, audioRoot)) throw new Error("Audio directory must be inside the vault.");
  try {
    const details = await lstat(audioRoot);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error(`Audio directory is not a regular directory: ${audioRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: string[] = [];
  await walk(audioRoot, audioRoot, result, audioExtensions);
  return result.sort((a, b) => path.relative(audioRoot, a).localeCompare(path.relative(audioRoot, b)));
}

async function scanTranscriptFiles(config: AppConfig): Promise<TranscriptRecord[]> {
  const root = path.resolve(config.vaultRoot);
  const transcriptRoot = path.join(root, "_transcripts");
  try { await access(transcriptRoot); } catch { return []; }
  const files: string[] = [];
  await walk(transcriptRoot, transcriptRoot, files, new Set([".md"]));
  const records: TranscriptRecord[] = [];
  for (const filePath of files) {
    const parsed = parseMarkdown(await readFile(filePath, "utf8"));
    if (parsed.frontmatter.type === "transcript" && typeof parsed.frontmatter.source_audio === "string") records.push({ path: filePath, ...parsed });
  }
  return records;
}

function parseDate(stem: string): { stem: string; date?: string } {
  const match = /^(\d{4}-\d{2}-\d{2})\s+-\s+(.+)$/.exec(stem);
  return match ? { date: match[1], stem: match[2] } : { stem };
}

export async function discoverTranscripts(config: AppConfig): Promise<TranscriptRecord[]> {
  return scanTranscriptFiles(config);
}

export async function discoverRecordings(config: AppConfig): Promise<RecordingJob[]> {
  const root = path.resolve(config.vaultRoot);
  const audioRoot = path.join(root, "_audio");
  const sourceSet = new Set((await scanTranscriptFiles(config)).map((record) => vaultRelativePath(String(record.frontmatter.source_audio))));
  const audioFiles = await scanAudio(config);
  const pending: RecordingJob[] = [];
  for (const audioPath of audioFiles) {
    const relativePath = path.relative(root, audioPath);
    const sourceAudio = vaultRelativePath(relativePath);
    if (sourceSet.has(sourceAudio)) continue;
    const details = await stat(audioPath);
    const relativeToAudio = path.relative(audioRoot, audioPath);
    const course = relativeToAudio.split(path.sep)[0] ?? "";
    const parsed = parseDate(path.basename(audioPath, path.extname(audioPath)));
    pending.push({ audioPath, sourceAudio, relativePath, course, stem: parsed.stem, date: parsed.date, birthtimeMs: details.birthtimeMs, mtimeMs: details.mtimeMs });
  }
  return pending;
}

export async function countAudio(config: AppConfig): Promise<number> { return (await scanAudio(config)).length; }
