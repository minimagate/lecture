import path from "node:path";
import { ensureNewOutput, writeAtomic } from "../files/output.js";
import { transcribeWithChunking, type ChunkedTranscriptionOptions } from "./chunked.js";

export type RecordingRequest = {
  inputPath: string;
  outputPath: string;
  title: string;
  date: string;
  course: string;
  model: string;
  language: string;
  apiKey: string;
  allowExisting?: boolean;
  chunking?: ChunkedTranscriptionOptions;
};

function displayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}

export async function transcribeRecording(request: RecordingRequest, format: string) {
  if (!request.allowExisting) await ensureNewOutput(request.outputPath);
  const result = await transcribeWithChunking(request.inputPath, format, request.model, request.language, request.apiKey, request.chunking);
  const markdown = `# ${request.title}\n\n**Course:** ${request.course}  \n**Date:** ${displayDate(request.date)}  \n**Source:** ${path.basename(request.inputPath)}  \n**Transcription model:** ${result.model}\n\n---\n\n## Transcript\n\n${result.text}\n`;
  await writeAtomic(request.outputPath, markdown);
  return result;
}
