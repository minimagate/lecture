import { readFile } from "node:fs/promises";

export const DEFAULT_MODEL = "openai/whisper-large-v3-turbo";
const endpoint = "https://openrouter.ai/api/v1/chat/completions";

export type TranscriptionResult = { text: string; model: string; cost?: number };

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

export async function transcribeAudio(filePath: string, format: string, model: string, language: string, apiKey: string): Promise<TranscriptionResult> {
  const audio = (await readFile(filePath)).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [
          { type: "text", text: `Transcribe this lecture accurately. The primary language is ${language}. Preserve English technical terms, names, acronyms, and mathematical terminology. Return only the transcript, without a summary or commentary.` },
          { type: "input_audio", input_audio: { data: audio, format } },
        ] }],
        stream: false,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error ? String(payload.error.message) : response.statusText;
      throw new Error(`OpenRouter request failed (${response.status}): ${message}`);
    }
    return parseResponse(payload);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("OpenRouter request timed out after 30 minutes.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
