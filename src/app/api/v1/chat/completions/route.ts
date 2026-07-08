import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { routeChat, routeChatStream } from "@/lib/router";
import { ChatRequest, NonRetryableError, StreamDelta, Usage } from "@/lib/types";
import { logger } from "@/lib/logger";


export const runtime = "nodejs";

function checkAuth(req: NextRequest): boolean {
  if (!config.gatewayApiKey) return true;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === config.gatewayApiKey;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: { message: "invalid_api_key" } }, { status: 401 });
  }

  const body = (await req.json()) as ChatRequest;

  if (!body?.messages?.length) {
    return NextResponse.json({ error: { message: "messages_required" } }, { status: 400 });
  }

  logger.incoming(config.displayModelName, Boolean(body.stream));

  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  if (body.stream) {
    let routed;
    try {
      routed = await routeChatStream(body);
    } catch (err) {
      const status = err instanceof NonRetryableError ? err.status : 502;
      return NextResponse.json({ error: { message: (err as Error).message } }, { status });
    }

    const { provider, model, first, generator } = routed;
    const encoder = new TextEncoder();
    const startedAt = Date.now();
    let totalContentChars = 0;
    let finalUsage: Usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        send({
          id,
          object: "chat.completion.chunk",
          created,
          model: config.displayModelName,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        });

        let receivedFinishReason = false;

        const emit = (delta: StreamDelta) => {
          if (delta.usage) finalUsage = delta.usage;
          if (delta.content || delta.toolCalls) {
            if (delta.content) totalContentChars += delta.content.length;
            const deltaPayload: Record<string, unknown> = {};
            if (delta.content) deltaPayload.content = delta.content;
            if (delta.toolCalls) deltaPayload.tool_calls = delta.toolCalls;
            send({
              id,
              object: "chat.completion.chunk",
              created,
              model: config.displayModelName,
              choices: [{ index: 0, delta: deltaPayload, finish_reason: null }],
            });
          }
          if (delta.finishReason) {
            receivedFinishReason = true;
            send({
              id,
              object: "chat.completion.chunk",
              created,
              model: config.displayModelName,
              choices: [{ index: 0, delta: {}, finish_reason: delta.finishReason }],
            });
          }
        };

        let interrupted = false;

        try {
          emit(first);
          for await (const delta of generator) {
            emit(delta);
          }
        } catch (err) {
          interrupted = true;
          logger.fail(provider, `stream_interrupted: ${(err as Error).message}`);
        }

        if (!receivedFinishReason) interrupted = true;

        const ms = Date.now() - startedAt;

        if (interrupted) {
          logger.fail(provider, `stream đứt giữa chừng sau ${ms}ms, ${totalContentChars} ký tự đã gửi`);
          controller.error(new Error("stream_interrupted_mid_response"));
          return;
        }

        logger.success(
          provider,
          model,
          ms,
          finalUsage.total_tokens
            ? finalUsage
            : { prompt_tokens: 0, completion_tokens: Math.round(totalContentChars / 4), total_tokens: Math.round(totalContentChars / 4) }
        );

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Gateway-Provider": provider,
        "X-Gateway-Model": model,
      },
    });
  }

  let result;
  try {
    result = await routeChat(body);
  } catch (err) {
    const status = err instanceof NonRetryableError ? err.status : 502;
    return NextResponse.json({ error: { message: (err as Error).message } }, { status });
  }

  const message: Record<string, unknown> = {
    role: "assistant",
    content: result.toolCalls?.length ? null : result.content,
  };
  if (result.toolCalls?.length) message.tool_calls = result.toolCalls;

  return NextResponse.json(
    {
      id,
      object: "chat.completion",
      created,
      model: config.displayModelName,
      choices: [{ index: 0, message, finish_reason: result.finishReason }],
      usage: result.usage,
    },
    { headers: { "X-Gateway-Provider": result.provider, "X-Gateway-Model": result.model } }
  );
}
