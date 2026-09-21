import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { defaultCommandRunner, type CommandRunner, ensureFfmpeg, getAudioDuration } from "./metadata.js";

export const CHUNK_DURATION_SECONDS = 20 * 60;
export const CHUNK_OVERLAP_SECONDS = 3;

export type AudioChunk = { path: string; index: number; start: number; end: number };
export type ChunkPlan = { start: number; end: number; index: number };

export function shouldChunkAudio(duration: number, chunkDuration = CHUNK_DURATION_SECONDS): boolean {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Audio duration must be a positive number.");
  return duration > chunkDuration;
}

export function planChunks(duration: number, chunkDuration = CHUNK_DURATION_SECONDS, overlap = CHUNK_OVERLAP_SECONDS): ChunkPlan[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Audio duration must be a positive number.");
  if (!Number.isFinite(chunkDuration) || chunkDuration <= 0) throw new Error("Chunk duration must be a positive number.");
  if (!Number.isFinite(overlap) || overlap < 0 || overlap >= chunkDuration) throw new Error("Chunk overlap must be smaller than the chunk duration.");

  const chunks: ChunkPlan[] = [];
  for (let start = 0; start < duration; start += chunkDuration) {
    chunks.push({ index: chunks.length + 1, start, end: Math.min(duration, start + chunkDuration + overlap) });
  }
  return chunks;
}

export function formatTimestamp(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export async function createAudioChunks(
  filePath: string,
  format: string,
  duration: number,
  options: { commandRunner?: CommandRunner; chunkDuration?: number; overlap?: number; tempRoot?: string } = {},
): Promise<{ chunks: AudioChunk[]; directory: string }> {
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  await ensureFfmpeg(commandRunner);
  const plans = planChunks(duration, options.chunkDuration, options.overlap);
  const directory = await mkdtemp(path.join(options.tempRoot ?? os.tmpdir(), "lecture-transcription-"));
  const chunks: AudioChunk[] = [];
  try {
    for (const plan of plans) {
      const chunkPath = path.join(directory, `chunk-${String(plan.index).padStart(4, "0")}.${format}`);
      await commandRunner("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(plan.start), "-t", String(plan.end - plan.start), "-i", filePath, "-map", "0:a:0", "-vn", "-c", "copy", "-avoid_negative_ts", "make_zero", "-y", chunkPath]);
      chunks.push({ path: chunkPath, index: plan.index, start: plan.start, end: plan.end });
    }
    return { chunks, directory };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(`Could not split the recording with FFmpeg: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function removeAudioChunks(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

export { getAudioDuration };
