import path from "node:path";
import { access } from "node:fs/promises";
import { stringifyFrontmatter, type Frontmatter } from "./frontmatter.js";
import { sanitizeFilename, writeAtomic } from "../files/output.js";

export type TranscriptData = {
  course: string;
  date: string;
  title: string;
  summary: string;
  sourceAudio: string;
  durationSeconds: number;
  transcriptionModel: string;
  metadataModel: string;
  metadataStatus: "complete" | "pending";
  transcribedAt: string;
  transcript: string;
};

export function transcriptFrontmatter(data: TranscriptData): Frontmatter {
  return { type: "transcript", course: data.course, date: data.date, title: data.title, summary: data.summary, source_audio: data.sourceAudio, duration_seconds: Math.round(data.durationSeconds), transcription_model: data.transcriptionModel, metadata_model: data.metadataModel, metadata_status: data.metadataStatus, transcribed_at: data.transcribedAt };
}

export function transcriptBody(data: TranscriptData): string {
  return `# ${data.title}\n\n## Summary\n\n${data.summary}\n\n## Transcript\n\n${data.transcript.trim()}\n`;
}

export function renderTranscript(data: TranscriptData): string {
  return stringifyFrontmatter(transcriptFrontmatter(data), transcriptBody(data));
}

export function fallbackTitle(stem: string): string { return sanitizeFilename(stem) || "Lecture"; }

export async function uniqueTranscriptPath(directory: string, date: string, title: string, originalPath?: string): Promise<string> {
  const safeTitle = fallbackTitle(title);
  const base = path.join(directory, `${date} - ${safeTitle}.md`);
  if (base === originalPath) return base;
  try { await access(base); } catch { return base; }
  for (let suffix = 2; ; suffix++) {
    const candidate = path.join(directory, `${date} - ${safeTitle} - ${suffix}.md`);
    if (candidate === originalPath) return candidate;
    try { await access(candidate); } catch { return candidate; }
  }
}

export async function writeTranscript(filePath: string, data: TranscriptData): Promise<void> {
  await writeAtomic(filePath, renderTranscript(data));
}
