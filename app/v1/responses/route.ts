import { NextRequest, NextResponse } from "next/server";
import {
  estimateTokens,
  estimateCost,
  optimizeMessages,
  deduplicateMessages,
  markModelDown,
  getMessageText,
  hasImageContent,
  type MessageContent,
} from "@/lib/token-optimizer";
import { FALLBACK_ORDER } from "@/lib/models";
import { buildModelRoutes, callUpstream, type ModelRoute } from "@/lib/provider";
import { log } from "@/lib/logger";

const modelRoutes = buildModelRoutes();

interface ResponsesRequest {
  model: string;
  input: string | Array<{ role: string; content: MessageContent }>;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  instructions?: string;
}

function responsesToMessages(body: ResponsesRequest): { role: string; content: MessageContent }[] {
  const messages: { role: string; content: MessageContent }[] = [];

  if (body.instructions) {
    messages.push({ role: "system", content: body.instructions });
  }

  if (typeof body.input === "string") {
    messages.push({ role: "user", content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const msg of body.input) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  return messages;
}

function makeResponsesOutput(requestId: string, modelUsed: string, content: string, inputTokens: number, outputTokens: number) {
  return {
    id: `resp_${requestId.replace(/-/g, "").slice(0, 24)}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: modelUsed,
    output: [
      {
        type: "message",
        id: `msg_${requestId.replace(/-/g, "").slice(0, 24)}`,
        role: "assistant",
        content: [{ type: "output_text", text: content }],
      },
    ],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

async function tryModel(modelId: string, body: Record<string, unknown>, messages: { role: string; content: MessageContent }[]) {
  const route = modelRoutes[modelId];
  if (!route) return null;
  try {
    const res = await callUpstream(route, body);
    const response = (await res.json()) as Record<string, unknown>;
    const choice = (response.choices as Record<string, unknown>[])?.[0] as Record<string, unknown> | undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const usage = response.usage as Record<string, number> | undefined;
    return { response, content: (message?.content as string) || "", modelUsed: modelId, inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0 };
  } catch {
    markModelDown(modelId);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    let body: ResponsesRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    if (!body.model) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }

    if (!body.input) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    if (typeof body.max_output_tokens === "number" && (body.max_output_tokens < 1 || body.max_output_tokens > 1000000)) {
      return NextResponse.json({ error: "max_output_tokens must be between 1 and 1000000" }, { status: 400 });
    }

    if (typeof body.temperature === "number" && (body.temperature < 0 || body.temperature > 2)) {
      return NextResponse.json({ error: "temperature must be between 0 and 2" }, { status: 400 });
    }

    const messages = responsesToMessages(body);
    let isAuto = body.model === "auto" || !modelRoutes[body.model];

    const maxTokens = body.max_output_tokens || 8000;
    const { messages: deduped } = deduplicateMessages(messages);
    const { messages: optimized } = optimizeMessages(deduped, maxTokens);

    const hasImage = optimized.some((m) => hasImageContent(m.content));
    if (hasImage && !isAuto) {
      isAuto = true;
      body.model = "auto";
    }

    const afterTokens = optimized.reduce((sum: number, m) => sum + estimateTokens(getMessageText(m.content)), 0);

    const openAIBody: Record<string, unknown> = {
      model: isAuto ? "auto" : body.model,
      messages: optimized,
      max_tokens: maxTokens,
    };
    if (body.temperature !== undefined) openAIBody.temperature = body.temperature;

    if (body.stream) {
      async function tryStream(modelId: string) {
        const route = modelRoutes[modelId];
        if (!route) return null;
        try {
          const upstream = await callUpstream(route, openAIBody);
          return { upstream, modelUsed: modelId };
        } catch {
          markModelDown(modelId);
          return null;
        }
      }

      let result = null;
      if (!isAuto) {
        result = await tryStream(body.model);
      }
      if (!result) {
        for (const fallback of FALLBACK_ORDER) {
          result = await tryStream(fallback);
          if (result) break;
        }
      }
      if (!result) throw new Error("All models failed");

      const respId = `resp_${requestId.replace(/-/g, "").slice(0, 24)}`;
      const msgId = `msg_${requestId.replace(/-/g, "").slice(0, 24)}`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const reader = result!.upstream.body?.getReader();
          if (!reader) { controller.close(); return; }

          const send = (event: string, data: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };

          send("response.created", { type: "response.created", response: { id: respId, object: "response", created_at: Math.floor(Date.now() / 1000), model: result!.modelUsed, output: [], usage: { input_tokens: 0, output_tokens: 0 } } });
          send("response.in_progress", { type: "response.in_progress", response: { id: respId, object: "response", created_at: Math.floor(Date.now() / 1000), model: result!.modelUsed, output: [], usage: { input_tokens: 0, output_tokens: 0 } } });
          send("response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { type: "message", id: msgId, role: "assistant", content: [] } });
          send("response.content_part.added", { type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "" } });

          let buffer = "";
          let content = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += new TextDecoder().decode(value);
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
                try {
                  const d = JSON.parse(line.slice(6));
                  const delta = d.choices?.[0]?.delta;
                  if (delta?.content) {
                    content += delta.content;
                    send("response.output_text.delta", { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: delta.content });
                  }
                } catch {}
              }
            }
          } catch {}

          send("response.output_text.done", { type: "response.output_text.done", output_index: 0, content_index: 0, text: content });
          send("response.content_part.done", { type: "response.content_part.done", output_index: 0, content_index: 0, part: { type: "output_text", text: content } });
          send("response.output_item.done", { type: "response.output_item.done", output_index: 0, item: { type: "message", id: msgId, role: "assistant", content: [{ type: "output_text", text: content }] } });
          send("response.completed", { type: "response.completed", response: { id: respId, object: "response", created_at: Math.floor(Date.now() / 1000), model: result!.modelUsed, output: [{ type: "message", id: msgId, role: "assistant", content: [{ type: "output_text", text: content }] }], usage: { input_tokens: afterTokens, output_tokens: 0 } } });

          controller.close();
        },
      });

      log({ timestamp: new Date().toISOString(), requestId, model: result.modelUsed, latencyMs: Date.now() - startTime, tokensIn: afterTokens });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Request-ID": requestId },
      });
    }

    let modelUsed = body.model;
    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;

    if (isAuto) {
      for (const modelId of ["auto", ...FALLBACK_ORDER]) {
        const result = await tryModel(modelId, openAIBody, optimized);
        if (result) {
          content = result.content;
          modelUsed = result.modelUsed;
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
          break;
        }
      }
    } else {
      const result = await tryModel(body.model, openAIBody, optimized);
      if (result) {
        content = result.content;
        modelUsed = result.modelUsed;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
      }
    }

    if (!content && content !== "") throw new Error("All models failed");

    log({ timestamp: new Date().toISOString(), requestId, model: modelUsed, latencyMs: Date.now() - startTime, tokensIn: inputTokens || afterTokens, tokensOut: outputTokens });
    return NextResponse.json(makeResponsesOutput(requestId, modelUsed, content, inputTokens || afterTokens, outputTokens));
  } catch (e) {
    log({ timestamp: new Date().toISOString(), requestId, model: "", latencyMs: Date.now() - startTime, status: 502, error: e instanceof Error ? e.message : "error" });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
