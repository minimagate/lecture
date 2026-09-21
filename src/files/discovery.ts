import path from "node:path";
import { lstat, readdir, access } from "node:fs/promises";
import type { CourseConfig } from "../config/courses.js";

const audioExtensions = new Set([".m4a", ".mp3", ".wav", ".aac", ".aiff", ".ogg", ".flac"]);

export type RecordingJob = {
  audioPath: string;
  transcriptPath: string;
  relativePath: string;
  course: string;
  title: string;
  date?: string;
};

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function replaceExtension(relativePath: string): string {
  return `${relativePath.slice(0, -path.extname(relativePath).length)}.md`;
}

function parseFilename(stem: string): { title: string; date?: string } {
  const match = /^(\d{4}-\d{2}-\d{2})\s+-\s+(.+)$/.exec(stem);
  return match ? { date: match[1], title: match[2] } : { title: stem };
}

async function walkAudio(root: string, current: string, result: string[]): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.endsWith(".tmp")) continue;
    const entryPath = path.join(current, entry.name);
    const details = await lstat(entryPath);
    if (details.isSymbolicLink()) continue;
    if (details.isDirectory()) await walkAudio(root, entryPath, result);
    else if (details.isFile() && audioExtensions.has(path.extname(entry.name).toLowerCase())) result.push(entryPath);
  }
}

export async function discoverRecordings(config: CourseConfig): Promise<RecordingJob[]> {
  return (await discoverAllRecordings(config)).filter((job) => !job.transcribed).map(({ transcribed: _transcribed, ...job }) => job);
}

export async function discoverAllRecordings(config: CourseConfig): Promise<(RecordingJob & { transcribed: boolean })[]> {
  const universityRoot = path.resolve(config.universityRoot);
  const audioRoot = path.resolve(universityRoot, config.audioDirectory);
  if (!isWithin(universityRoot, audioRoot)) throw new Error("Configured audio directory must be inside universityRoot.");
  try {
    const details = await lstat(audioRoot);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error(`Audio directory is not a regular directory: ${audioRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  await walkAudio(audioRoot, audioRoot, files);
  return (await Promise.all(files.map(async (audioPath) => {
    const relativePath = path.relative(audioRoot, audioPath);
    const transcriptPath = path.resolve(universityRoot, replaceExtension(relativePath));
    if (!isWithin(universityRoot, transcriptPath)) throw new Error(`Audio path resolves outside universityRoot: ${relativePath}`);
    const relativeParts = relativePath.split(path.sep);
    const parsed = parseFilename(path.basename(audioPath, path.extname(audioPath)));
    const transcribed = await access(transcriptPath).then(() => true, () => false);
    return { audioPath, transcriptPath, relativePath, course: relativeParts[0] ?? "", title: parsed.title, date: parsed.date, transcribed };
  }))).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
