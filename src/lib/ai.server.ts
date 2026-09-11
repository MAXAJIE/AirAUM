/**
 * Lovable AI Gateway helper.
 *
 * Every AI call in this app returns STRUCTURED JSON only — the backend never
 * parses prose, and the model is never the source of truth. Failures are
 * non-fatal: the caller falls back to a deterministic path and the work is
 * routed to a human.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
export const AI_MODEL = "openai/gpt-6-astra";

export type AiFailure = { ok: false; status: number; message: string; retryable: boolean };
export type AiSuccess<T> = { ok: true; data: T; latencyMs: number; model: string };
export type AiResult<T> = AiSuccess<T> | AiFailure;

export type InputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type InputItem = { role: "system" | "user"; content: InputPart[] };

function messageForStatus(status: number, body: string): string {
  if (status === 402) return "The AI allowance for this workspace is used up. Reviews will wait for a human.";
  if (status === 403) return "AI is switched off for this workspace, so this was sent for human review.";
  if (status === 429) return "AI is busy right now. This was queued for human review.";
  if (status === 401) return "AI is not configured on this server.";
  return `AI could not complete the check (${status}). ${body.slice(0, 160)}`;
}

/**
 * Calls the gateway with a strict JSON schema and streams the response.
 * Streaming is required: reasoning runs routinely exceed a buffered request's
 * lifetime. No timeout is imposed — aborting mid-run wastes work that is
 * billed anyway.
 */
export async function callAiJson<T>(
  instructions: string,
  input: InputItem[],
  schema: { name: string; schema: Record<string, unknown> },
): Promise<AiResult<T>> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, status: 401, message: messageForStatus(401, ""), retryable: false };

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        instructions,
        input,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        text: {
          format: {
            type: "json_schema",
            name: schema.name,
            strict: true,
            schema: schema.schema,
          },
        },
      }),
    });
  } catch (e) {
    return {
      ok: false,
      status: 503,
      message: "The AI service could not be reached. This was sent for human review.",
      retryable: true,
      ...(e instanceof Error ? {} : {}),
    };
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      message: messageForStatus(res.status, body),
      retryable: res.status === 429 || res.status >= 500,
    };
  }

  // Accumulate the SSE output_text deltas.
  let text = "";
  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload) as { type?: string; delta?: string; response?: { output_text?: string } };
            if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
            else if (evt.type === "response.completed" && typeof evt.response?.output_text === "string" && !text) {
              text = evt.response.output_text;
            }
          } catch {
            /* partial frame, ignore */
          }
        }
      }
    }
  } catch {
    return { ok: false, status: 502, message: "The AI reply was cut short.", retryable: true };
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { ok: false, status: 502, message: "The AI returned no usable result.", retryable: false };
  }
  try {
    return {
      ok: true,
      data: JSON.parse(text.slice(start, end + 1)) as T,
      latencyMs: Date.now() - started,
      model: AI_MODEL,
    };
  } catch {
    return { ok: false, status: 502, message: "The AI result could not be read.", retryable: false };
  }
}
