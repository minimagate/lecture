import { CHUNK_DURATION_SECONDS, CHUNK_OVERLAP_SECONDS, createAudioChunks, createCompressedAudio, formatTimestamp, getAudioDuration, planChunks, removeAudioChunks, shouldChunkAudio, TRANSCRIPTION_AUDIO_FORMAT, type AudioChunk } from "../audio/chunk.js";
import type { CommandRunner } from "../audio/metadata.js";
import { OpenRouterRequestError, transcribeAudio, type TranscriptionResult } from "./openrouter.js";

export type ChunkProgress = (chunk: AudioChunk, total: number, duration: number) => void;
export type TranscriptionLog = (message: string) => void;
export type ChunkedTranscriptionOptions = {
  commandRunner?: CommandRunner;
  onChunkComplete?: ChunkProgress;
  onProgress?: TranscriptionLog;
  getDuration?: typeof getAudioDuration;
  transcribe?: typeof transcribeAudio;
  createCompressed?: typeof createCompressedAudio;
  createChunks?: typeof createAudioChunks;
  removeChunks?: typeof removeAudioChunks;
};

export type CombinedTranscription = TranscriptionResult & { duration: number; chunked: boolean };

function combineTexts(results: TranscriptionResult[]): string {
  return results.map((result) => result.text.trim()).filter(Boolean).join("\n\n");
}

async function transcribeChunkWithRetry(
  chunk: AudioChunk,
  model: string,
  language: string,
  apiKey: string,
  depth: number,
  options: ChunkedTranscriptionOptions,
): Promise<TranscriptionResult[]> {
  const transcribe = options.transcribe ?? transcribeAudio;
  try {
    return [await transcribe(chunk.path, TRANSCRIPTION_AUDIO_FORMAT, model, language, apiKey)];
  } catch (error) {
    if (!(error instanceof OpenRouterRequestError) || error.status !== 413 || depth >= 10) throw error;

    options.onProgress?.(`Segment ${formatTimestamp(chunk.start)}–${formatTimestamp(chunk.end)} is too large; splitting it and retrying...`);
    const getDuration = options.getDuration ?? getAudioDuration;
    const duration = await getDuration(chunk.path, options.commandRunner);
    const halfDuration = duration / 2;
    const createChunks = options.createChunks ?? createAudioChunks;
    const removeChunks = options.removeChunks ?? removeAudioChunks;
    const split = await createChunks(chunk.path, TRANSCRIPTION_AUDIO_FORMAT, duration, {
      commandRunner: options.commandRunner,
      chunkDuration: halfDuration,
      overlap: Math.min(CHUNK_OVERLAP_SECONDS, halfDuration / 2),
    });
    if (split.chunks.length < 2) {
      await removeChunks(split.directory);
      throw error;
    }

    const results: TranscriptionResult[] = [];
    try {
      for (const smallerChunk of split.chunks) {
        results.push(...await transcribeChunkWithRetry(smallerChunk, model, language, apiKey, depth + 1, options));
      }
      return results;
    } finally {
      await removeChunks(split.directory);
    }
  }
}

export async function transcribeWithChunking(
  filePath: string,
  _format: string,
  model: string,
  language: string,
  apiKey: string,
  options: ChunkedTranscriptionOptions = {},
): Promise<CombinedTranscription> {
  options.onProgress?.("Checking audio duration...");
  const getDuration = options.getDuration ?? getAudioDuration;
  const duration = await getDuration(filePath, options.commandRunner);
  options.onProgress?.(`Audio duration: ${formatTimestamp(duration)}.`);
  if (!shouldChunkAudio(duration)) {
    options.onProgress?.("Compressing audio for transcription...");
    const compressed = await (options.createCompressed ?? createCompressedAudio)(filePath, { commandRunner: options.commandRunner });
    try {
      options.onProgress?.("Starting transcription request...");
      const result = await (options.transcribe ?? transcribeAudio)(compressed.path, TRANSCRIPTION_AUDIO_FORMAT, model, language, apiKey);
      return { ...result, duration, chunked: false };
    } finally {
      await (options.removeChunks ?? removeAudioChunks)(compressed.directory);
    }
  }

  const plannedChunks = planChunks(duration, CHUNK_DURATION_SECONDS, CHUNK_OVERLAP_SECONDS);
  options.onProgress?.(`Splitting and compressing long audio into ${plannedChunks.length} chunks...`);
  const createChunks = options.createChunks ?? createAudioChunks;
  const removeChunks = options.removeChunks ?? removeAudioChunks;
  const { chunks, directory } = await createChunks(filePath, _format, duration, { commandRunner: options.commandRunner });
  options.onProgress?.(`Audio split into ${chunks.length} compressed chunks. Transcribing...`);
  const results: TranscriptionResult[] = [];
  try {
    for (const chunk of chunks) {
      try {
        results.push(...await transcribeChunkWithRetry(chunk, model, language, apiKey, 0, options));
      } catch (error) {
        throw new Error(`Chunk ${chunk.index} of ${chunks.length} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      options.onChunkComplete?.(chunk, chunks.length, duration);
    }
    options.onProgress?.("Combining chunk transcripts...");
    const costs = results.map((result) => result.cost);
    return {
      text: combineTexts(results),
      model: results[0]?.model ?? model,
      cost: costs.every((cost): cost is number => cost !== undefined) ? costs.reduce((sum, cost) => sum + cost, 0) : undefined,
      duration,
      chunked: true,
    };
  } finally {
    await removeChunks(directory);
  }
}
