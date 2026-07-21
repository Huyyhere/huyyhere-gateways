import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { responseCache } from "@/lib/cache";
import { getBreakerStats } from "@/lib/circuit-breaker";
import { globalLimiter } from "@/lib/rate-limiter";
import { MODEL_CAPABILITIES } from "@/lib/models";

function formatMetric(name: string, help: string, type: string, lines: string[]) {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${lines.join("\n")}\n`;
}

export async function GET() {
  const lines: string[] = [];

  lines.push(formatMetric(
    "gateway_uptime_seconds",
    "Gateway uptime in seconds",
    "gauge",
    [`gateway_uptime_seconds ${process.uptime().toFixed(0)}`]
  ));

  const mem = process.memoryUsage();
  lines.push(formatMetric(
    "gateway_memory_bytes",
    "Memory usage in bytes",
    "gauge",
    [
      `gateway_memory_bytes{type="heapUsed"} ${mem.heapUsed}`,
      `gateway_memory_bytes{type="heapTotal"} ${mem.heapTotal}`,
      `gateway_memory_bytes{type="rss"} ${mem.rss}`,
    ]
  ));

  const cache = responseCache.stats;
  lines.push(formatMetric(
    "gateway_cache_entries",
    "Number of entries in response cache",
    "gauge",
    [`gateway_cache_entries ${cache.entries}`]
  ));

  lines.push(formatMetric(
    "gateway_cache_bytes",
    "Total size of cached responses",
    "gauge",
    [`gateway_cache_bytes ${cache.bytes}`]
  ));

  const breakers = getBreakerStats();
  for (const [model, stats] of Object.entries(breakers)) {
    const stateValue = stats.state === "open" ? 1 : stats.state === "half-open" ? 0.5 : 0;
    lines.push(formatMetric(
      "gateway_circuit_breaker_state",
      "Circuit breaker state (0=closed, 0.5=half-open, 1=open)",
      "gauge",
      [`gateway_circuit_breaker_state{model="${model}"} ${stateValue}`]
    ));
    lines.push(formatMetric(
      "gateway_circuit_breaker_failures_total",
      "Total failures in circuit breaker",
      "gauge",
      [`gateway_circuit_breaker_failures_total{model="${model}"} ${stats.failCount}`]
    ));
  }

  const limiterStats = globalLimiter.stats;
  lines.push(formatMetric(
    "gateway_rate_limit_keys",
    "Number of rate limit keys tracked",
    "gauge",
    [`gateway_rate_limit_keys ${limiterStats.keys}`]
  ));

  try {
    const db = await getDb();
    const since24h = new Date(Date.now() - 24 * 3600_000);

    const modelAgg = await db.collection("requests").aggregate([
      { $match: { createdAt: { $gte: since24h } } },
      { $group: {
        _id: "$model",
        requests: { $sum: 1 },
        tokensIn: { $sum: "$tokensIn" },
        tokensOut: { $sum: "$tokensOut" },
        cost: { $sum: "$cost" },
        errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
        avgLatency: { $avg: "$latencyMs" },
      }},
    ]).toArray();

    for (const d of modelAgg as Array<Record<string, unknown>>) {
      const model = d._id as string;
      const labels = `model="${model}"`;

      lines.push(formatMetric(
        "gateway_requests_total",
        "Total requests by model (24h)",
        "counter",
        [`gateway_requests_total{${labels}} ${d.requests}`]
      ));

      lines.push(formatMetric(
        "gateway_tokens_total",
        "Total tokens by model (24h)",
        "counter",
        [
          `gateway_tokens_total{${labels},direction="input"} ${d.tokensIn}`,
          `gateway_tokens_total{${labels},direction="output"} ${d.tokensOut}`,
        ]
      ));

      lines.push(formatMetric(
        "gateway_cost_dollars_total",
        "Total cost by model (24h)",
        "counter",
        [`gateway_cost_dollars_total{${labels}} ${(d.cost as number).toFixed(6)}`]
      ));

      lines.push(formatMetric(
        "gateway_errors_total",
        "Total errors by model (24h)",
        "counter",
        [`gateway_errors_total{${labels}} ${d.errors}`]
      ));

      lines.push(formatMetric(
        "gateway_latency_avg_seconds",
        "Average latency by model (24h)",
        "gauge",
        [`gateway_latency_avg_seconds{${labels}} ${((d.avgLatency as number) / 1000).toFixed(3)}`]
      ));
    }

    const totalRequests = await db.collection("requests").countDocuments({ createdAt: { $gte: since24h } });
    const totalErrors = await db.collection("requests").countDocuments({ createdAt: { $gte: since24h }, status: "error" });

    lines.push(formatMetric(
      "gateway_requests_total",
      "Total requests (24h)",
      "counter",
      [`gateway_requests_total ${totalRequests}`]
    ));

    lines.push(formatMetric(
      "gateway_errors_total",
      "Total errors (24h)",
      "counter",
      [`gateway_errors_total ${totalErrors}`]
    ));
  } catch {
    lines.push("# MongoDB not available for persistent metrics\n");
  }

  for (const [model, caps] of Object.entries(MODEL_CAPABILITIES)) {
    if (model === "auto") continue;
    lines.push(formatMetric(
      "gateway_model_info",
      "Model metadata",
      "gauge",
      [
        `gateway_model_info{model="${model}",vision="${caps.vision}",tools="${caps.tools}"} 1`,
      ]
    ));
  }

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
