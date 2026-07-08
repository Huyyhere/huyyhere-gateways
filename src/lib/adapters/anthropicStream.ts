import { ChatRequest, ProviderError, StreamDelta } from "../types";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { parseRetryAfterMs } from "../parseRetry";

function buildMessages(req: ChatRequest): { system?: string; messages: { role: string; content: string }[] } {
  let system: string | undefined;
  const messages: { role: string; content: string }[] = [];

  for (const m of req.messages) {
    if (m.role === "system") { system = m.content || ""; continue; }
    if (m.role === "tool") continue;
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content || "" });
  }

  if (!messages.length) messages.push({ role: "user", content: "Hello" });
  return { system, messages };
}

export async function* streamAnthropic(
  req: ChatRequest,
  apiKey: string,
  model: string,
  baseUrl: string
): AsyncGenerator<StreamDelta> {
  const { system, messages } = buildMessages(req);

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.max_tokens || 4096,
    messages,
    stream: true,
  };
  if (system) body.system = system;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.top_p !== undefined) body.top_p = req.top_p;

  const res = await fetchWithTimeout(
    baseUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    60_000
  );

  if (!res.ok) {
    const text = await res.text();
    const headerRetry = res.headers.get("retry-after");
    const retryAfterMs = headerRetry ? Number(headerRetry) * 1000 : parseRetryAfterMs(text);
    throw new ProviderError(`anthropic_error_${res.status}: ${text}`, res.status, retryAfterMs);
  }

  if (!res.body) throw new ProviderError("empty_stream_body", 502);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let messageId = "";
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = rawEvent.split("\n");
      const eventType = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() || "";
      const dataLine = lines.find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload) continue;

      try {
        const parsed = JSON.parse(payload);

        if (eventType === "message_start" || parsed.type === "message_start") {
          messageId = parsed.message?.id || "";
          inputTokens = parsed.message?.usage?.input_tokens || 0;
          continue;
        }

        if (eventType === "content_block_delta" || parsed.type === "content_block_delta") {
          const text = parsed.delta?.text || "";
          if (text) {
            yield { content: text };
          }
          continue;
        }

        if (eventType === "message_delta" || parsed.type === "message_delta") {
          outputTokens = parsed.usage?.output_tokens || 0;
          const stopReason = parsed.delta?.stop_reason;
          if (stopReason) {
            yield {
              finishReason: stopReason === "end_turn" ? "stop" : stopReason,
              usage: {
                prompt_tokens: inputTokens,
                completion_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens,
              },
            };
          }
          continue;
        }

        if (eventType === "message_stop" || parsed.type === "message_stop") {
          break;
        }
      } catch {
        continue;
      }
    }
  }
}
