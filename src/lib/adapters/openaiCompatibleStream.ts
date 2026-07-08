import { ChatRequest, ProviderError, StreamDelta } from "../types";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { parseRetryAfterMs } from "../parseRetry";

export async function* streamOpenAICompatible(
  req: ChatRequest,
  apiKey: string,
  model: string,
  baseUrl: string,
  extraHeaders?: Record<string, string>
): AsyncGenerator<StreamDelta> {
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    top_p: req.top_p,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.tools?.length) body.tools = req.tools;
  if (req.tool_choice !== undefined) body.tool_choice = req.tool_choice;

  const res = await fetchWithTimeout(
    baseUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    },
    30_000
  );

  if (!res.ok) {
    const text = await res.text();
    const headerRetry = res.headers.get("retry-after");
    const retryAfterMs = headerRetry ? Number(headerRetry) * 1000 : parseRetryAfterMs(text);
    throw new ProviderError(`provider_error_${res.status}: ${text}`, res.status, retryAfterMs);
  }

  if (!res.body) throw new ProviderError("empty_stream_body", 502);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (payload === "[DONE]") return;
      if (!payload) continue;

      try {
        const parsed = JSON.parse(payload);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        yield {
          content: delta?.content ?? undefined,
          role: delta?.role ?? undefined,
          finishReason: choice?.finish_reason ?? undefined,
          toolCalls: delta?.tool_calls ?? undefined,
          usage: parsed.usage
            ? {
                prompt_tokens: parsed.usage.prompt_tokens || 0,
                completion_tokens: parsed.usage.completion_tokens || 0,
                total_tokens: parsed.usage.total_tokens || 0,
              }
            : undefined,
        };
      } catch {
        continue;
      }
    }
  }
}
