const endpoint = "https://openrouter.ai/api/v1/chat/completions";
export const METADATA_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A specific Italian lecture title of about 4 to 10 words." },
    summary: { type: "string", description: "A factual Italian summary of 1 to 3 sentences and about 30 to 70 words." },
  },
  required: ["title", "summary"],
  additionalProperties: false,
};

export type LectureMetadata = { title: string; summary: string; cost?: number };

export function parseLectureMetadata(payload: unknown): LectureMetadata {
  const response = payload as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { cost?: unknown } };
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter returned no metadata.");
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error("OpenRouter returned invalid metadata JSON."); }
  const metadata = value as { title?: unknown; summary?: unknown };
  if (typeof metadata?.title !== "string" || !metadata.title.trim() || typeof metadata.summary !== "string") throw new Error("OpenRouter returned incomplete lecture metadata.");
  return { title: metadata.title.trim(), summary: metadata.summary.trim(), cost: typeof response.usage?.cost === "number" ? response.usage.cost : undefined };
}

export async function generateLectureMetadata(transcript: string, course: string, model: string, apiKey: string): Promise<LectureMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: `You are generating metadata for an Italian university lecture transcript.\n\nCourse: ${course}\n\nReturn only structured data matching the requested schema. Generate an Italian title of 4-10 words describing the principal subject, with no course name, date, generic phrase, clickbait, or invented topic. Generate an Italian factual summary in 1-3 sentences, roughly 30-70 words, covering only concepts actually present in the transcript. Preserve correct mathematical and scientific terminology.\n\nTranscript:\n${transcript}` }],
        response_format: { type: "json_schema", json_schema: { name: "lecture_metadata", strict: true, schema: METADATA_SCHEMA } },
        stream: false,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error ? String(payload.error.message) : response.statusText;
      throw new Error(`OpenRouter metadata request failed (${response.status}): ${message}`);
    }
    return parseLectureMetadata(payload);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("OpenRouter metadata request timed out after 10 minutes.");
    throw error;
  } finally { clearTimeout(timeout); }
}
