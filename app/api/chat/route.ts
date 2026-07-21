import { NextRequest, NextResponse } from "next/server";
import {
  selectModel,
  estimateTokens,
  estimateCost,
  optimizeMessages,
  deduplicateMessages,
  markModelDown,
  getMessageText,
  hasImageContent,
  type MessageContent,
} from "@/lib/token-optimizer";
import { getTool, toFunctionSchema } from "@/lib/tools/registry";
import "@/lib/tools/builtins";
import { buildModelRoutes, callUpstream, type ModelRoute } from "@/lib/provider";
import { log } from "@/lib/logger";
import { responseCache, buildCacheKey } from "@/lib/cache";
import { isCircuitOpen, recordFail, recordSuccess } from "@/lib/circuit-breaker";
import { trackRequest } from "@/lib/analytics";
import { recordUsage } from "@/lib/api-keys";
import { validateApiKey } from "@/lib/api-auth";
import { semanticGet, semanticSet, semanticStats } from "@/lib/semantic-cache";
import { promptCacheGet, promptCacheSet } from "@/lib/prompt-cache";
import { startRateLimiterCleanup } from "@/lib/rate-limiter";

startRateLimiterCleanup();

const modelRoutes = buildModelRoutes();
const FALLBACK_ORDER = Object.keys(modelRoutes);

async function processToolCalls(
  route: ModelRoute,
  body: Record<string, unknown>,
  messages: { role: string; content: MessageContent }[],
  maxRounds = 3
): Promise<{ result: Record<string, unknown>; toolCalls: { name: string; result: string }[] }> {
  const usedTools: { name: string; result: string }[] = [];
  let currentMessages = [...messages] as Record<string, unknown>[];

  for (let round = 0; round < maxRounds; round++) {
    const res = await callUpstream(route, { ...body, messages: currentMessages });
    const response = (await res.json()) as Record<string, unknown>;

    const choice = (response.choices as Record<string, unknown>[])?.[0] as Record<string, unknown> | undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const toolCalls = message?.tool_calls as Record<string, unknown>[] | undefined;
    if (!toolCalls?.length) {
      return { result: response, toolCalls: usedTools };
    }

    currentMessages.push(message as Record<string, unknown>);

    for (const tc of toolCalls) {
      const fn = tc.function as Record<string, string> | undefined;
      const fnName = fn?.name || "";
      const fnArgs = JSON.parse(fn?.arguments || "{}");

      let result: string;
      const tool = getTool(fnName);
      if (tool) {
        result = await tool.execute(fnArgs);
      } else {
        result = `Unknown tool: ${fnName}`;
      }

      usedTools.push({ name: fnName, result });
      currentMessages.push({
        role: "tool",
        tool_call_id: tc.id as string,
        content: result,
      });
    }
  }

  const finalBody = { ...body, messages: currentMessages };
  const { tools: _, tool_choice: __, ...cleanBody } = finalBody as Record<string, unknown>;
  const res = await callUpstream(route, cleanBody);
  const final = (await res.json()) as Record<string, unknown>;
  return { result: final, toolCalls: usedTools };
}

async function callWithAutoFallback(
  body: Record<string, unknown>,
  messages: { role: string; content: MessageContent }[]
): Promise<{ result: Record<string, unknown>; modelUsed: string; toolCalls: { name: string; result: string }[] }> {
  const decision = selectModel("auto", messages, body.cheap === true);
  const tried = new Set<string>();

  async function tryModel(modelId: string) {
    if (tried.has(modelId)) return null;
    tried.add(modelId);
    const route = modelRoutes[modelId];
    if (!route) return null;
    if (isCircuitOpen(modelId)) return null;
    try {
      const result = await processToolCalls(route, body, messages);
      recordSuccess(modelId);
      return { result: result.result, modelUsed: modelId, toolCalls: result.toolCalls };
    } catch {
      markModelDown(modelId);
      recordFail(modelId);
      return null;
    }
  }

  const primary = await tryModel(decision.model);
  if (primary) return primary;

  for (const fallback of FALLBACK_ORDER) {
    const res = await tryModel(fallback);
    if (res) return res;
  }

  throw new Error("All models failed");
}

async function callStreamWithAutoFallback(
  body: Record<string, unknown>,
  messages: { role: string; content: MessageContent }[]
): Promise<{ upstream: Response; modelUsed: string }> {
  const decision = selectModel("auto", messages, body.cheap === true);
  const tried = new Set<string>();

  async function tryStream(modelId: string) {
    if (tried.has(modelId)) return null;
    tried.add(modelId);
    const route = modelRoutes[modelId];
    if (!route) return null;
    if (isCircuitOpen(modelId)) return null;
    try {
      const upstream = await callUpstream(route, body);
      recordSuccess(modelId);
      return { upstream, modelUsed: modelId };
    } catch {
      markModelDown(modelId);
      recordFail(modelId);
      return null;
    }
  }

  const primary = await tryStream(decision.model);
  if (primary) return primary;

  for (const fallback of FALLBACK_ORDER) {
    const res = await tryStream(fallback);
    if (res) return res;
  }

  throw new Error("All models failed");
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  let modelUsed = "";
  let status = 200;
  const authKey = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";

  // Validate API key
  const auth = await validateApiKey(req);
  if (!auth.valid) return auth.error!;

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      status = 400;
      return NextResponse.json({ error: "invalid JSON body", type: "invalid_request_error" }, { status: 400 });
    }

    let modelId = body.model as string;
    if (!modelId) {
      status = 400;
      return NextResponse.json({ error: "model is required", type: "invalid_request_error" }, { status: 400 });
    }

    let messages = (body.messages || []) as { role: string; content: MessageContent }[];

    if (!Array.isArray(messages) || messages.length === 0) {
      status = 400;
      return NextResponse.json({ error: "messages must be a non-empty array", type: "invalid_request_error" }, { status: 400 });
    }

    for (const msg of messages) {
      if (!msg.role || !["system", "user", "assistant", "tool"].includes(msg.role)) {
        status = 400;
        return NextResponse.json({ error: `invalid message role: ${msg.role}`, type: "invalid_request_error" }, { status: 400 });
      }
    }

    if (body.max_tokens !== undefined && (typeof body.max_tokens !== "number" || body.max_tokens < 1 || body.max_tokens > 1000000)) {
      status = 400;
      return NextResponse.json({ error: "max_tokens must be between 1 and 1000000", type: "invalid_request_error" }, { status: 400 });
    }

    if (body.temperature !== undefined && (typeof body.temperature !== "number" || body.temperature < 0 || body.temperature > 2)) {
      status = 400;
      return NextResponse.json({ error: "temperature must be between 0 and 2", type: "invalid_request_error" }, { status: 400 });
    }

    if (body.top_p !== undefined && (typeof body.top_p !== "number" || body.top_p < 0 || body.top_p > 1)) {
      status = 400;
      return NextResponse.json({ error: "top_p must be between 0 and 1", type: "invalid_request_error" }, { status: 400 });
    }

    const beforeTokens = messages.reduce(
      (sum: number, m) => sum + estimateTokens(getMessageText(m.content)),
      0
    );

    const { messages: deduped, removed: dedupRemoved } = deduplicateMessages(messages);
    const maxTokens = (body.max_tokens as number) || 8000;
    const { messages: optimized, tokensSaved } = optimizeMessages(deduped, maxTokens);

    const afterTokens = optimized.reduce(
      (sum: number, m) => sum + estimateTokens(getMessageText(m.content)),
      0
    );

    body.messages = optimized;

    const isAuto = modelId === "auto";
    const hasImage = optimized.some((m) => hasImageContent(m.content));
    if (hasImage && !isAuto) {
      modelId = "auto";
    }

    const enableTools = body.tools !== false;
    if (enableTools) {
      body.tools = toFunctionSchema();
      body.tool_choice = "auto";
    }

    const isStreaming = !!body.stream;
    const cacheScope = authKey || "anon";
    const cacheKey = !isStreaming ? buildCacheKey(body, cacheScope) : null;
    const cached = cacheKey ? responseCache.get(cacheKey) : null;

    if (cached) {
      const parsed = JSON.parse(cached);
      log({ timestamp: new Date().toISOString(), requestId, model: "cached", latencyMs: Date.now() - startTime, tokensIn: afterTokens });
      await trackRequest({
        requestId, timestamp: new Date().toISOString(), model: "cached", status: "cached",
        latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: 0, cost: 0, tools: [],
      });
      if (authKey) recordUsage(authKey, afterTokens, 0).catch(() => {});
      return NextResponse.json({
        ...parsed,
        _gateway: {
          ...parsed._gateway,
          request_id: requestId,
          cached: true,
        },
      });
    }

    const lastUserMsg = getMessageText(optimized[optimized.length - 1]?.content || "");
    const semanticHit = semanticGet(cacheScope, lastUserMsg);
    if (semanticHit && !isStreaming && !hasImage) {
      log({ timestamp: new Date().toISOString(), requestId, model: "semantic-cache", latencyMs: Date.now() - startTime, tokensIn: afterTokens });
      await trackRequest({
        requestId, timestamp: new Date().toISOString(), model: semanticHit.model, status: "cached",
        latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: 0, cost: 0, tools: [],
      });
      if (authKey) recordUsage(authKey, afterTokens, 0).catch(() => {});
      return NextResponse.json({
        id: `chatcmpl-${requestId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: semanticHit.model,
        choices: [{ index: 0, message: { role: "assistant", content: semanticHit.response }, finish_reason: "stop" }],
        usage: { prompt_tokens: afterTokens, completion_tokens: 0, total_tokens: afterTokens },
        _gateway: { request_id: requestId, model: semanticHit.model, cached: "semantic", tokens: { input: afterTokens, output: 0 } },
      });
    }

    const systemMsg = optimized.find(m => m.role === "system");
    const promptHit = systemMsg ? promptCacheGet(cacheScope, getMessageText(systemMsg.content), lastUserMsg) : null;
    if (promptHit && !isStreaming && !hasImage) {
      log({ timestamp: new Date().toISOString(), requestId, model: "prompt-cache", latencyMs: Date.now() - startTime, tokensIn: afterTokens });
      await trackRequest({
        requestId, timestamp: new Date().toISOString(), model: "prompt-cache", status: "cached",
        latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: 0, cost: 0, tools: [],
      });
      if (authKey) recordUsage(authKey, afterTokens, 0).catch(() => {});
      return NextResponse.json({
        id: `chatcmpl-${requestId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "prompt-cache",
        choices: [{ index: 0, message: { role: "assistant", content: promptHit }, finish_reason: "stop" }],
        usage: { prompt_tokens: afterTokens, completion_tokens: 0, total_tokens: afterTokens },
        _gateway: { request_id: requestId, model: "prompt-cache", cached: "prompt", tokens: { input: afterTokens, output: 0 } },
      });
    }

    const currentModel = isAuto ? "auto" : modelId;

    if (isAuto) {
      if (isStreaming) {
        const { upstream, modelUsed: mu } = await callStreamWithAutoFallback(body, body.messages as { role: string; content: MessageContent }[]);
        modelUsed = mu;
        log({ timestamp: new Date().toISOString(), requestId, model: modelUsed, latencyMs: Date.now() - startTime, tokensIn: afterTokens });
        await trackRequest({
          requestId, timestamp: new Date().toISOString(), model: modelUsed, status: "success",
          latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: 0, cost: 0, tools: [],
        });
        return new NextResponse(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "X-Model-Used": modelUsed,
            "X-Tokens-Saved": String(beforeTokens - afterTokens),
            "X-Request-ID": requestId,
          },
        });
      }

      const { result: data, modelUsed: mu, toolCalls } = await callWithAutoFallback(body, body.messages as { role: string; content: MessageContent }[]);
      modelUsed = mu;

      const usage = data.usage as Record<string, number> | undefined;
      const outputTokens = usage?.completion_tokens || estimateTokens(JSON.stringify(data));
    const pricing = { input: 1, output: 4 };
    const cost = estimateCost(afterTokens, outputTokens, pricing);

      log({
        timestamp: new Date().toISOString(), requestId, model: modelUsed,
        latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: outputTokens,
        tools: toolCalls.map((t) => t.name),
      });

      await trackRequest({
          requestId, timestamp: new Date().toISOString(), model: modelUsed, status: "success",
          latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: outputTokens,
          cost, tools: toolCalls.map((t) => t.name),
        });
        if (authKey) recordUsage(authKey, afterTokens, outputTokens).catch(() => {});

        const response = {
          ...data,
          _gateway: {
            request_id: requestId,
            model: modelUsed,
            tokens: { input: afterTokens, output: outputTokens },
            saved: { tokens: beforeTokens - afterTokens, deduped: dedupRemoved },
            tools: toolCalls.length ? toolCalls : undefined,
            estimatedCost: `$${cost.toFixed(6)}`,
          },
        };

        if (cacheKey) responseCache.set(cacheKey, JSON.stringify(response));
        const assistantMsg = ((data.choices as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
        const assistantContent = (assistantMsg?.content as string) || "";
        if (assistantContent) {
          semanticSet(cacheScope, lastUserMsg, assistantContent, modelUsed, outputTokens);
          if (systemMsg) promptCacheSet(cacheScope, getMessageText(systemMsg.content), lastUserMsg, assistantContent);
        }
        return NextResponse.json(response);
    }

    const route = modelRoutes[modelId];
    if (!route) {
      status = 400;
      return NextResponse.json({ error: `unknown model: ${modelId}`, type: "invalid_request_error" }, { status: 400 });
    }
    modelUsed = modelId;

    if (isCircuitOpen(modelId)) {
      status = 503;
      return NextResponse.json(
        { error: `model temporarily unavailable: ${modelId}`, type: "server_error" },
        { status: 503 }
      );
    }

    if (isStreaming) {
      let upstream: Response;
      try {
        upstream = await callUpstream(route, body);
        recordSuccess(modelId);
      } catch (e) {
        recordFail(modelId);
        throw e;
      }
      log({ timestamp: new Date().toISOString(), requestId, model: modelUsed, latencyMs: Date.now() - startTime, tokensIn: afterTokens });
      await trackRequest({
        requestId, timestamp: new Date().toISOString(), model: modelUsed, status: "success",
        latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: 0, cost: 0, tools: [],
      });
      return new NextResponse(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "X-Model-Used": modelId,
          "X-Tokens-Saved": String(beforeTokens - afterTokens),
          "X-Request-ID": requestId,
        },
      });
    }

    let data: Record<string, unknown>;
    let toolCalls: { name: string; result: string }[];
    try {
      const result = await processToolCalls(route, body, body.messages as { role: string; content: MessageContent }[]);
      data = result.result;
      toolCalls = result.toolCalls;
      recordSuccess(modelId);
    } catch (e) {
      recordFail(modelId);
      throw e;
    }

    const usage = data.usage as Record<string, number> | undefined;
    const outputTokens = usage?.completion_tokens || estimateTokens(JSON.stringify(data));
    const pricing = { input: 1, output: 4 };
    const cost = estimateCost(afterTokens, outputTokens, pricing);

    log({
      timestamp: new Date().toISOString(), requestId, model: modelUsed,
      latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: outputTokens,
      tools: toolCalls.map((t) => t.name),
    });

    await trackRequest({
      requestId, timestamp: new Date().toISOString(), model: modelUsed, status: "success",
      latencyMs: Date.now() - startTime, tokensIn: afterTokens, tokensOut: outputTokens,
      cost, tools: toolCalls.map((t) => t.name),
    });
    if (authKey) recordUsage(authKey, afterTokens, outputTokens).catch(() => {});

    const response = {
      ...data,
      _gateway: {
        request_id: requestId,
        model: modelId,
        tokens: { input: afterTokens, output: outputTokens },
        saved: { tokens: beforeTokens - afterTokens, deduped: dedupRemoved },
        tools: toolCalls.length ? toolCalls : undefined,
        estimatedCost: `$${cost.toFixed(6)}`,
      },
    };

    if (cacheKey) responseCache.set(cacheKey, JSON.stringify(response));
    const assistantMsg2 = ((data.choices as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const assistantContent2 = (assistantMsg2?.content as string) || "";
    if (assistantContent2) {
      semanticSet(cacheScope, lastUserMsg, assistantContent2, modelUsed, outputTokens);
      if (systemMsg) promptCacheSet(cacheScope, getMessageText(systemMsg.content), lastUserMsg, assistantContent2);
    }
    return NextResponse.json(response);
  } catch (e) {
    status = 500;
    const errMsg = e instanceof Error ? e.message : "upstream error";
    log({ timestamp: new Date().toISOString(), requestId, model: modelUsed, latencyMs: Date.now() - startTime, status: 502, error: errMsg });
    await trackRequest({
      requestId, timestamp: new Date().toISOString(), model: modelUsed || "unknown", status: "error",
      latencyMs: Date.now() - startTime, tokensIn: 0, tokensOut: 0, cost: 0, tools: [], error: errMsg,
    });
    return NextResponse.json(
      { error: errMsg, type: "server_error", request_id: requestId },
      { status: 502 }
    );
  }
}
