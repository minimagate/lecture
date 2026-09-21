const endpoint = "https://openrouter.ai/api/v1/chat/completions";

export type TeachingResult = { body: string; cost?: number };

function normalizeMathOutsideCode(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  const prose: string[] = [];
  const flushProse = () => {
    if (!prose.length) return;
    output.push(prose.join("\n").replace(/\\\[([\s\S]*?)\\\]/g, (_, equation: string) => `$$\n${equation.trim()}\n$$`).replace(/\\\(([\s\S]*?)\\\)/g, (_, equation: string) => `$${equation.trim()}$`));
    prose.length = 0;
  };

  for (let index = 0; index < lines.length; index++) {
    const opening = /^([ \t]*)(`{3,}|~{3,})(.*)$/.exec(lines[index]);
    if (!opening) {
      prose.push(lines[index]);
      continue;
    }

    const indentation = opening[1];
    const fence = opening[2][0];
    const fenceLength = opening[2].length;
    const info = opening[3].trim().toLowerCase();
    const closingPattern = new RegExp(`^[ \\t]*${fence}{${fenceLength},}[ \\t]*$`);
    let closing = -1;
    for (let candidate = index + 1; candidate < lines.length; candidate++) {
      if (closingPattern.test(lines[candidate])) {
        closing = candidate;
        break;
      }
    }

    if ((info === "math" || info === "latex") && closing !== -1) {
      flushProse();
      const equation = lines.slice(index + 1, closing).join("\n").trim();
      output.push("$$", equation, "$$");
      index = closing;
      continue;
    }

    flushProse();
    output.push(lines[index]);
    if (closing === -1) {
      output.push(...lines.slice(index + 1), `${indentation}${fence.repeat(fenceLength)}`);
      break;
    }
    output.push(...lines.slice(index + 1, closing + 1));
    index = closing;
  }

  flushProse();
  return output.join("\n");
}

export function normalizeTeachingNote(body: string): string {
  let normalized = body.trim();
  const wrapped = /^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(normalized);
  if (wrapped) normalized = wrapped[1].trim();
  return normalizeMathOutsideCode(normalized).trim();
}

export function parseTeachingResponse(payload: unknown): TeachingResult {
  const response = payload as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { cost?: unknown } };
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("OpenRouter returned no teaching note.");
  return { body: normalizeTeachingNote(content), cost: typeof response.usage?.cost === "number" ? response.usage.cost : undefined };
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
