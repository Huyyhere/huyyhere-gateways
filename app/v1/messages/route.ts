import { NextRequest, NextResponse } from "next/server";
import { buildModelRoutes, callUpstream } from "@/lib/provider";
import { getKeyPool } from "@/lib/models";
import { log } from "@/lib/logger";
import { trackRequest } from "@/lib/analytics";

const modelRoutes = buildModelRoutes();

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image?: { type: string; media_type: string; data: string } }>;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop_sequences?: string[];
  metadata?: { user_id?: string };
}

function anthropicToOpenAI(body: AnthropicRequest): Record<string, unknown> {
  const messages: Array<{ role: string; content: unknown }> = [];

  if (body.system) {
    messages.push({ role: "system", content: body.system });
  }

  for (const msg of body.messages) {
    if (typeof msg.content === "string") {
      messages.push({ role: msg.role, content: msg.content });
    } else {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      for (const part of msg.content) {
        if (part.type === "text" && part.text) {
          parts.push({ type: "text", text: part.text });
        } else if (part.type === "image" && part.image) {
          parts.push({
            type: "image_url",
            image_url: { url: `data:${part.image.media_type};base64,${part.image.data}` },
          });
        }
      }
      messages.push({ role: msg.role, content: parts });
    }
  }

  return {
    model: body.model === "auto" ? "auto" : body.model,
    messages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stream: body.stream,
    stop: body.stop_sequences,
  };
}

function openAIToAnthropic(response: Record<string, unknown>, requestId: string) {
  const choice = (response.choices as Record<string, unknown>[])?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  const usage = response.usage as Record<string, number> | undefined;

  return {
    id: `msg_${requestId.replace(/-/g, "").slice(0, 24)}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: (message?.content as string) || "" }],
    model: response.model || "auto",
    stop_reason: choice?.finish_reason === "stop" ? "end_turn" : choice?.finish_reason || "end_turn",
    usage: {
      input_tokens: usage?.prompt_tokens || 0,
      output_tokens: usage?.completion_tokens || 0,
    },
  };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    let body: AnthropicRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ type: "error", error: { type: "invalid_request_error", message: "invalid JSON" } }, { status: 400 });
    }

    if (!body.model) {
      return NextResponse.json({ type: "error", error: { type: "invalid_request_error", message: "model is required" } }, { status: 400 });
    }

    if (!body.max_tokens) {
      return NextResponse.json({ type: "error", error: { type: "invalid_request_error", message: "max_tokens is required" } }, { status: 400 });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ type: "error", error: { type: "invalid_request_error", message: "messages must be a non-empty array" } }, { status: 400 });
    }

    const openAIBody = anthropicToOpenAI(body);

    if (body.stream) {
      const route = modelRoutes[body.model] || modelRoutes["glm-4.7-flash"];
      if (!route) {
        return NextResponse.json({ type: "error", error: { type: "not_found_error", message: "no model available" } }, { status: 404 });
      }

      const upstream = await callUpstream(route, openAIBody);

      const encoder = new TextEncoder();
      let outputTokens = 0;
      const stream = new ReadableStream({
        async start(controller) {
          const reader = upstream.body?.getReader();
          if (!reader) { controller.close(); return; }

          const msgId = `msg_${requestId.replace(/-/g, "").slice(0, 24)}`;

          controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
            type: "message_start",
            message: { id: msgId, type: "message", role: "assistant", content: [], model: route.model, stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } },
          })}\n\n`));

          let buffer = "";
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
                    controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
                      type: "content_block_delta",
                      index: 0,
                      delta: { type: "text_delta", text: delta.content },
                    })}\n\n`));
                  }
                  if (d.usage?.completion_tokens) outputTokens = d.usage.completion_tokens;
                  if (d.choices?.[0]?.finish_reason) {
                    if (!outputTokens && d.usage?.completion_tokens) outputTokens = d.usage.completion_tokens;
                    controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({
                      type: "message_delta",
                      delta: { stop_reason: "end_turn", stop_sequence: null },
                      usage: { output_tokens: outputTokens },
                    })}\n\n`));
                    controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`));
                  }
                } catch {}
              }
            }
          } catch {}

          controller.close();
        },
      });

      const latencyMs = Date.now() - startTime;
      log({ timestamp: new Date().toISOString(), requestId, model: `anthropic:${body.model}`, latencyMs });
      await trackRequest({
        requestId, timestamp: new Date().toISOString(), model: body.model, status: "success",
        latencyMs, tokensIn: 0, tokensOut: outputTokens, cost: 0, tools: [],
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Request-ID": requestId,
        },
      });
    }

    const route = modelRoutes[body.model] || modelRoutes["glm-4.7-flash"];
    if (!route) {
      return NextResponse.json({ type: "error", error: { type: "not_found_error", message: "no model available" } }, { status: 404 });
    }

    const res = await callUpstream(route, openAIBody);
    const data = await res.json();

    const latencyMs = Date.now() - startTime;
    const usage = data.usage as Record<string, number> | undefined;
    const outputTokens = usage?.completion_tokens || 0;
    log({ timestamp: new Date().toISOString(), requestId, model: `anthropic:${body.model}`, latencyMs });
    await trackRequest({
      requestId, timestamp: new Date().toISOString(), model: body.model, status: "success",
      latencyMs, tokensIn: usage?.prompt_tokens || 0, tokensOut: outputTokens, cost: 0, tools: [],
    });

    return NextResponse.json(openAIToAnthropic(data, requestId));
  } catch (e) {
    const latencyMs = Date.now() - startTime;
    log({ timestamp: new Date().toISOString(), requestId, model: "", latencyMs, status: 502, error: e instanceof Error ? e.message : "error" });
    await trackRequest({
      requestId, timestamp: new Date().toISOString(), model: "", status: "error",
      latencyMs, tokensIn: 0, tokensOut: 0, cost: 0, tools: [], error: e instanceof Error ? e.message : "error",
    });
    return NextResponse.json(
      { type: "error", error: { type: "api_error", message: e instanceof Error ? e.message : "upstream error" } },
      { status: 502 }
    );
  }
}
