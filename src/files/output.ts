import path from "node:path";
import { access, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";

const supportedExtensions = new Set([".m4a", ".mp3", ".wav", ".aac", ".aiff", ".ogg", ".flac"]);

export function validateAudioPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new Error(`Unsupported audio format "${extension || "unknown"}". Supported formats: ${[...supportedExtensions].join(", ")}.`);
  }
  return extension.slice(1);
}

export async function validateInputAudio(filePath: string): Promise<string> {
  const format = validateAudioPath(filePath);
  try {
    const details = await stat(filePath);
    if (!details.isFile()) throw new Error(`Input audio is not a regular file: ${filePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Input audio file not found: ${filePath}`);
    throw error;
  }
  return format;
}

export function sanitizeFilename(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error(`Invalid date "${value}".`);
  return date;
}

export function outputPath(directory: string, date: string, title: string): string {
  const safeTitle = sanitizeFilename(title);
  if (!safeTitle) throw new Error("Title must contain at least one usable character.");
  return path.join(directory, `${date} - ${safeTitle}.md`);
}

export async function ensureNewOutput(filePath: string): Promise<void> {
  try {
    await access(filePath);
    throw new Error(`Output already exists: ${filePath}. Choose a different title or date.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function writeAtomic(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    try { await unlink(temporaryPath); } catch { /* best effort cleanup */ }
    throw error;
  }
}
