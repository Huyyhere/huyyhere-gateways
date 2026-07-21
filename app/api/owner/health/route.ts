import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { buildModelRoutes } from "@/lib/provider";
import { auditLog } from "@/lib/audit";

interface HealthResult {
  model: string;
  provider: string;
  status: "ok" | "error" | "timeout" | "no_key";
  latencyMs: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  await auditLog("health_check", "Full health check started");

  const routes = buildModelRoutes();
  const results: HealthResult[] = [];

  const checks = Object.entries(routes).map(async ([modelId, route]) => {
    const apiKey = route.getApiKey();
    if (!apiKey) {
      results.push({
        model: modelId,
        provider: route.baseUrl,
        status: "no_key",
        latencyMs: 0,
        error: "chưa có key nào cho provider này — thêm ở tab Provider Keys",
      });
      return;
    }

    const start = Date.now();
    try {
      const res = await fetch(`${route.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: route.model,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });

      results.push({
        model: modelId,
        provider: route.baseUrl,
        status: res.ok ? "ok" : "error",
        latencyMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({
        model: modelId,
        provider: route.baseUrl,
        status: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "error",
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  await Promise.all(checks);

  const summary = {
    total: results.length,
    ok: results.filter(r => r.status === "ok").length,
    noKey: results.filter(r => r.status === "no_key").length,
    error: results.filter(r => r.status !== "ok" && r.status !== "no_key").length,
  };

  return Response.json({ results, summary }, { headers: secureHeaders() });
}
