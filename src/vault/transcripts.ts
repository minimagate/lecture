import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { formatDate, parseDate } from "../files/output.js";
import { discoverRecordings, discoverTranscripts, type RecordingJob, type TranscriptRecord } from "../files/discovery.js";
import { transcribeWithChunking } from "../transcription/chunked.js";
import { validateInputAudio } from "../files/output.js";
import { generateLectureMetadata, type LectureMetadata } from "../metadata/openrouter.js";
import { parseMarkdown } from "../markdown/frontmatter.js";
import { fallbackTitle, uniqueTranscriptPath, writeTranscript, type TranscriptData } from "../markdown/transcript.js";
import type { AppConfig } from "../config/app-config.js";

export type ProcessResult = { transcriptPath: string; metadataPending: boolean; transcriptionCost?: number; metadataCost?: number; duration: number; title: string };

function lectureDate(job: RecordingJob): string {
  if (job.date) { parseDate(job.date); return job.date; }
  const timestamp = job.birthtimeMs > 0 ? job.birthtimeMs : job.mtimeMs;
  return formatDate(new Date(timestamp || Date.now()));
}

function baseData(job: RecordingJob, config: AppConfig, transcript: string, duration: number, title: string, metadata: LectureMetadata | undefined, metadataStatus: "complete" | "pending"): TranscriptData {
  return { course: job.course, date: lectureDate(job), title, summary: metadata?.summary ?? "", sourceAudio: job.sourceAudio, durationSeconds: duration, transcriptionModel: config.transcriptionModel, metadataModel: config.metadataModel, metadataStatus, transcribedAt: new Date().toISOString(), transcript };
}

export async function processRecording(job: RecordingJob, config: AppConfig, apiKey: string, options: { onChunkComplete?: (chunk: { index: number; start: number; end: number }, total: number, duration: number) => void; onProgress?: (message: string) => void; transcribe?: typeof transcribeWithChunking; generateMetadata?: typeof generateLectureMetadata } = {}): Promise<ProcessResult> {
  options.onProgress?.("Validating audio file...");
  const format = await validateInputAudio(job.audioPath);
  options.onProgress?.(`Audio format: ${format}.`);
  const transcription = await (options.transcribe ?? transcribeWithChunking)(job.audioPath, format, config.transcriptionModel, config.language, apiKey, { onChunkComplete: options.onChunkComplete, onProgress: options.onProgress });
  let metadata: LectureMetadata | undefined;
  options.onProgress?.("Transcription complete. Generating title and summary...");
  try { metadata = await (options.generateMetadata ?? generateLectureMetadata)(transcription.text, job.course, config.metadataModel, apiKey); } catch (error) {
    options.onProgress?.(`Title and summary generation failed: ${error instanceof Error ? error.message : String(error)}`);
    /* Preserve the successful ASR as pending metadata. */
  }
  const title = metadata?.title ? fallbackTitle(metadata.title) : fallbackTitle(job.stem);
  const directory = path.join(config.vaultRoot, "_transcripts", job.course);
  await mkdir(directory, { recursive: true });
  const transcriptPath = await uniqueTranscriptPath(directory, lectureDate(job), title);
  const data = baseData(job, config, transcription.text, transcription.duration, title, metadata, metadata ? "complete" : "pending");
  options.onProgress?.("Saving transcript...");
  await writeTranscript(transcriptPath, data);
  return { transcriptPath, metadataPending: !metadata, transcriptionCost: transcription.cost, metadataCost: metadata?.cost, duration: transcription.duration, title };
}

function transcriptText(body: string): string {
  const match = /## Transcript\s*\n([\s\S]*)$/i.exec(body);
  return match?.[1]?.trim() ?? body.trim();
}

export async function enrichTranscript(record: TranscriptRecord, config: AppConfig, apiKey: string): Promise<{ path: string; title: string; cost?: number }> {
  const source = String(record.frontmatter.source_audio).replaceAll("\\", "/");
  const sourcePath = path.resolve(config.vaultRoot, source);
  const root = path.resolve(config.vaultRoot);
  if (!source.startsWith("_audio/") || !path.relative(root, sourcePath) || path.relative(root, sourcePath).startsWith("..")) throw new Error(`Unsafe source_audio path in ${record.path}.`);
  const metadata = await generateLectureMetadata(transcriptText(record.body), String(record.frontmatter.course ?? ""), config.metadataModel, apiKey);
  const date = String(record.frontmatter.date);
  parseDate(date);
  const title = fallbackTitle(metadata.title);
  const destination = await uniqueTranscriptPath(path.dirname(record.path), date, title, record.path);
  const updated: TranscriptData = { course: String(record.frontmatter.course ?? ""), date, title, summary: metadata.summary, sourceAudio: source, durationSeconds: Number(record.frontmatter.duration_seconds ?? 0), transcriptionModel: String(record.frontmatter.transcription_model ?? config.transcriptionModel), metadataModel: config.metadataModel, metadataStatus: "complete", transcribedAt: String(record.frontmatter.transcribed_at ?? new Date().toISOString()), transcript: transcriptText(record.body) };
  await writeTranscript(destination, updated);
  if (destination !== record.path) await import("node:fs/promises").then(({ unlink }) => unlink(record.path));
  return { path: destination, title, cost: metadata.cost };
}

export async function pendingMetadata(config: AppConfig): Promise<TranscriptRecord[]> {
  return (await discoverTranscripts(config)).filter((record) => record.frontmatter.metadata_status === "pending");
}

export async function pendingRecordings(config: AppConfig): Promise<RecordingJob[]> { return discoverRecordings(config); }
