import { ChatRequest, ProviderError, StreamDelta } from "../types";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { parseRetryAfterMs } from "../parseRetry";
import { toGeminiContents, toGeminiTools, toGeminiToolConfig } from "./gemini";

function extractToolCalls(parts: any[]): any[] | undefined {
  const functionCallParts = parts.filter((p) => p.functionCall);
  if (!functionCallParts.length) return undefined;
  return functionCallParts.map((p, i) => ({
    index: i,
    id: `call_${Date.now()}_${i}`,
    type: "function",
    function: {
      name: p.functionCall.name,
      arguments: JSON.stringify(p.functionCall.args || {}),
    },
  }));
}

export async function* streamGemini(
  req: ChatRequest,
  apiKey: string,
  model: string,
  baseUrl: string
): AsyncGenerator<StreamDelta> {
  const { contents, systemInstruction } = toGeminiContents(req);

  const res = await fetchWithTimeout(
    `${baseUrl}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction,
        tools: toGeminiTools(req.tools),
        toolConfig: toGeminiToolConfig(req.tool_choice),
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.max_tokens,
          topP: req.top_p,
        },
      }),
    },
    30_000
  );

  if (!res.ok) {
    const text = await res.text();
    const headerRetry = res.headers.get("retry-after");
    const retryAfterMs = headerRetry ? Number(headerRetry) * 1000 : parseRetryAfterMs(text);
    throw new ProviderError(`gemini_error_${res.status}: ${text}`, res.status, retryAfterMs);
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
      if (!payload) continue;

      try {
        const parsed = JSON.parse(payload);
        const candidate = parsed.candidates?.[0];
        const parts: any[] = candidate?.content?.parts || [];
        const text = parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join("");
        const toolCalls = extractToolCalls(parts);
        const finishReason = candidate?.finishReason as string | undefined;

        yield {
          content: text || undefined,
          toolCalls,
          finishReason: finishReason ? finishReason.toLowerCase() : undefined,
          usage: parsed.usageMetadata
            ? {
                prompt_tokens: parsed.usageMetadata.promptTokenCount || 0,
                completion_tokens: parsed.usageMetadata.candidatesTokenCount || 0,
                total_tokens: parsed.usageMetadata.totalTokenCount || 0,
              }
            : undefined,
        };
      } catch {
        continue;
      }
    }
  }
}
