import { createAudioChunks, getAudioDuration, removeAudioChunks, shouldChunkAudio, type AudioChunk } from "../audio/chunk.js";
import type { CommandRunner } from "../audio/metadata.js";
import { transcribeAudio, type TranscriptionResult } from "./openrouter.js";

export type ChunkProgress = (chunk: AudioChunk, total: number, duration: number) => void;
export type ChunkedTranscriptionOptions = {
  commandRunner?: CommandRunner;
  onChunkComplete?: ChunkProgress;
  getDuration?: typeof getAudioDuration;
  transcribe?: typeof transcribeAudio;
  createChunks?: typeof createAudioChunks;
  removeChunks?: typeof removeAudioChunks;
};

export type CombinedTranscription = TranscriptionResult & { duration: number; chunked: boolean };

function combineTexts(results: TranscriptionResult[]): string {
  return results.map((result) => result.text.trim()).filter(Boolean).join("\n\n");
}

export async function transcribeWithChunking(
  filePath: string,
  format: string,
  model: string,
  language: string,
  apiKey: string,
  options: ChunkedTranscriptionOptions = {},
): Promise<CombinedTranscription> {
  const getDuration = options.getDuration ?? getAudioDuration;
  const transcribe = options.transcribe ?? transcribeAudio;
  const duration = await getDuration(filePath, options.commandRunner);
  if (!shouldChunkAudio(duration)) {
    const result = await transcribe(filePath, format, model, language, apiKey);
    return { ...result, duration, chunked: false };
  }

  const createChunks = options.createChunks ?? createAudioChunks;
  const removeChunks = options.removeChunks ?? removeAudioChunks;
  const { chunks, directory } = await createChunks(filePath, format, duration, { commandRunner: options.commandRunner });
  const results: TranscriptionResult[] = [];
  try {
    for (const chunk of chunks) {
      try {
        results.push(await transcribe(chunk.path, format, model, language, apiKey));
      } catch (error) {
        throw new Error(`Chunk ${chunk.index} of ${chunks.length} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      options.onChunkComplete?.(chunk, chunks.length, duration);
    }
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
