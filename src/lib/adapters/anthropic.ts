import { AdapterResult, ChatRequest, ChatMessage, ProviderError } from "../types";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { parseRetryAfterMs } from "../parseRetry";

function buildMessages(req: ChatRequest): { system?: string; messages: { role: string; content: string }[] } {
  let system: string | undefined;
  const messages: { role: string; content: string }[] = [];

  for (const m of req.messages) {
    if (m.role === "system") {
      system = m.content || "";
      continue;
    }
    if (m.role === "tool") continue;
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content || "" });
  }

  if (!messages.length) messages.push({ role: "user", content: "Hello" });
  return { system, messages };
}

export async function callAnthropic(
  req: ChatRequest,
  apiKey: string,
  model: string,
  baseUrl: string
): Promise<AdapterResult> {
  const { system, messages } = buildMessages(req);

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.max_tokens || 4096,
    messages,
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

  const data: any = await res.json();
  const textContent = (data.content || [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");

  return {
    content: textContent,
    finishReason: data.stop_reason === "end_turn" ? "stop" : data.stop_reason || "stop",
    toolCalls: undefined,
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}
