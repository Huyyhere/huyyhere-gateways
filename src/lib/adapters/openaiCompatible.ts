import { AdapterResult, ChatRequest, ProviderError } from "../types";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { parseRetryAfterMs } from "../parseRetry";

export async function callOpenAICompatible(
  req: ChatRequest,
  apiKey: string,
  model: string,
  baseUrl: string,
  extraHeaders?: Record<string, string>
): Promise<AdapterResult> {
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    top_p: req.top_p,
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
    const retryAfterMs = headerRetry
      ? Number(headerRetry) * 1000
      : parseRetryAfterMs(text);

    throw new ProviderError(`provider_error_${res.status}: ${text}`, res.status, retryAfterMs);
  }

  const data: any = await res.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || "",
    finishReason: choice?.finish_reason || "stop",
    toolCalls: choice?.message?.tool_calls,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
  };
}
