import { NextRequest, NextResponse } from "next/server";
import { getKeyPool } from "@/lib/models";
import { selectKey } from "@/lib/provider";
import { log } from "@/lib/logger";

const EMBEDDING_MODELS: Record<string, { baseUrl: string; model: string; dimensions: number }> = {};

function initEmbeddingModels() {
  const zaiKeys = getKeyPool("ZAI");
  if (zaiKeys.length) {
    EMBEDDING_MODELS["embedding-3"] = {
      baseUrl: process.env.ZAI_BASE_URL!,
      model: "embedding-3",
      dimensions: 1024,
    };
  }
}

initEmbeddingModels();

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const input = body.input as string | string[];
    const modelId = (body.model as string) || "embedding-3";

    if (!input) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const config = EMBEDDING_MODELS[modelId];
    if (!config) {
      return NextResponse.json(
        { error: `unknown embedding model: ${modelId}. Available: ${Object.keys(EMBEDDING_MODELS).join(", ")}` },
        { status: 400 }
      );
    }

    const keys = getKeyPool("ZAI");
    if (!keys.length) {
      return NextResponse.json({ error: "no embedding provider configured" }, { status: 500 });
    }

    const key = selectKey(keys);
    const res = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: config.model, input, dimensions: body.dimensions || config.dimensions }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json();

    log({
      timestamp: new Date().toISOString(),
      requestId,
      model: `embed:${modelId}`,
      latencyMs: Date.now() - start,
      tokensIn: typeof input === "string" ? input.length : input.join("").length,
    });

    return NextResponse.json({
      object: "list",
      model: modelId,
      data: data.data || [],
      usage: data.usage || { prompt_tokens: 0, total_tokens: 0 },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "embedding error", request_id: requestId },
      { status: 500 }
    );
  }
}
