const endpoint = "https://openrouter.ai/api/v1/chat/completions";

export type TeachingResult = { body: string; cost?: number };

export function parseTeachingResponse(payload: unknown): TeachingResult {
  const response = payload as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { cost?: unknown } };
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("OpenRouter returned no teaching note.");
  return { body: content.trim(), cost: typeof response.usage?.cost === "number" ? response.usage.cost : undefined };
}

export async function generateTeachingNote(prompt: string, model: string, apiKey: string): Promise<TeachingResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20 * 60 * 1000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error ? String(payload.error.message) : response.statusText;
      throw new Error(`OpenRouter teaching request failed (${response.status}): ${message}`);
    }
    return parseTeachingResponse(payload);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("OpenRouter teaching request timed out after 20 minutes.");
    throw error;
  } finally { clearTimeout(timeout); }
}
