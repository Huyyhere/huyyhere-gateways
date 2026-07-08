import { AdapterResult, ChatRequest, ProviderError } from "../types";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { parseRetryAfterMs } from "../parseRetry";

export function toGeminiContents(req: ChatRequest) {
  const systemParts: string[] = [];
  const contents: any[] = [];
  const toolCallNameById = new Map<string, string>();

  for (const msg of req.messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content ?? "");
      continue;
    }

    if (msg.role === "assistant" && msg.tool_calls?.length) {
      const parts = msg.tool_calls.map((tc: any) => {
        toolCallNameById.set(tc.id, tc.function?.name);
        let args: unknown = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        return { functionCall: { name: tc.function?.name, args } };
      });
      contents.push({ role: "model", parts });
      continue;
    }

    if (msg.role === "tool") {
      const name =
        (msg.tool_call_id && toolCallNameById.get(msg.tool_call_id)) ||
        msg.name ||
        "unknown_function";
      let response: unknown = { result: msg.content ?? "" };
      try {
        response = msg.content ? JSON.parse(msg.content) : {};
      } catch {
        response = { result: msg.content ?? "" };
      }
      contents.push({
        role: "function",
        parts: [{ functionResponse: { name, response } }],
      });
      continue;
    }

    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content ?? "" }],
    });
  }

  return {
    contents,
    systemInstruction: systemParts.length
      ? { parts: [{ text: systemParts.join("\n") }] }
      : undefined,
  };
}

export function toGeminiTools(tools?: any[]) {
  if (!tools?.length) return undefined;
  const functionDeclarations = tools
    .filter((t) => t.type === "function" && t.function)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

export function toGeminiToolConfig(toolChoice: any) {
  if (toolChoice === undefined || toolChoice === "auto") return undefined;
  if (toolChoice === "none") return { functionCallingConfig: { mode: "NONE" } };
  if (toolChoice === "required") return { functionCallingConfig: { mode: "ANY" } };
  if (typeof toolChoice === "object" && toolChoice.function?.name) {
    return {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: [toolChoice.function.name] },
    };
  }
  return undefined;
}

function extractToolCalls(parts: any[]): any[] | undefined {
  const functionCallParts = parts.filter((p) => p.functionCall);
  if (!functionCallParts.length) return undefined;
  return functionCallParts.map((p, i) => ({
    id: `call_${Date.now()}_${i}`,
    type: "function",
    function: {
      name: p.functionCall.name,
      arguments: JSON.stringify(p.functionCall.args || {}),
    },
  }));
}

export async function callGemini(
  req: ChatRequest,
  apiKey: string,
  model: string,
  baseUrl: string
): Promise<AdapterResult> {
  const { contents, systemInstruction } = toGeminiContents(req);

  const res = await fetchWithTimeout(
    `${baseUrl}/${model}:generateContent?key=${apiKey}`,
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

  const data: any = await res.json();
  const candidate = data.candidates?.[0];
  const parts: any[] = candidate?.content?.parts || [];
  const content = parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join("");
  const toolCalls = extractToolCalls(parts);

  return {
    content,
    finishReason: (candidate?.finishReason || "STOP").toLowerCase(),
    toolCalls,
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };
}
