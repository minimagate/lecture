import path from "node:path";
import { readFile } from "node:fs/promises";

export const DEFAULT_MODEL = "openai/whisper-large-v3-turbo";
const endpoint = "https://openrouter.ai/api/v1/audio/transcriptions";

export type TranscriptionResult = { text: string; model: string; cost?: number };

export class OpenRouterRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`OpenRouter request failed (${status}): ${message}`);
    this.name = "OpenRouterRequestError";
  }
}

export function parseResponse(payload: unknown): TranscriptionResult {
  const response = payload as { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown; usage?: { cost?: unknown } };
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("OpenRouter returned no transcript text.");
  return {
    text: content.trim(),
    model: typeof response.model === "string" ? response.model : "unknown",
    cost: typeof response.usage?.cost === "number" ? response.usage.cost : undefined,
  };
}

function parseAudioResponse(payload: unknown): TranscriptionResult {
  const response = payload as { text?: unknown; model?: unknown; usage?: { cost?: unknown } };
  if (typeof response?.text !== "string" || !response.text.trim()) throw new Error("OpenRouter returned no transcript text.");
  return {
    text: response.text.trim(),
    model: typeof response.model === "string" ? response.model : "unknown",
    cost: typeof response.usage?.cost === "number" ? response.usage.cost : undefined,
  };
}

function mimeType(format: string): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "m4a") return "audio/mp4";
  if (format === "aiff") return "audio/aiff";
  if (format === "mp4") return "video/mp4";
  return `audio/${format}`;
}

export async function transcribeAudio(filePath: string, format: string, model: string, language: string, apiKey: string): Promise<TranscriptionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);
  try {
    const audio = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mimeType(format) }), path.basename(filePath));
    form.append("model", model);
    form.append("language", language);
    form.append("response_format", "json");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error ? String(payload.error.message) : response.statusText;
      throw new OpenRouterRequestError(response.status, message);
    }
    return parseAudioResponse(payload);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("OpenRouter request timed out after 30 minutes.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
