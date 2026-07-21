import { NextRequest, NextResponse } from "next/server";
import { getAnalytics, getRecentLogs, clearAnalytics, getMongoAnalytics } from "@/lib/analytics";
import { responseCache } from "@/lib/cache";
import { getBreakerStats } from "@/lib/circuit-breaker";
import { globalLimiter } from "@/lib/rate-limiter";
import { MODEL_CAPABILITIES } from "@/lib/models";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const section = url.searchParams.get("section");

  if (section === "logs") {
    const limit = Number(url.searchParams.get("limit")) || 100;
    const model = url.searchParams.get("model") || undefined;
    return NextResponse.json({ logs: getRecentLogs(limit, model) });
  }

  if (section === "breakers") {
    return NextResponse.json({ breakers: getBreakerStats() });
  }

  if (section === "cache") {
    return NextResponse.json({ cache: responseCache.stats });
  }

  if (section === "models") {
    return NextResponse.json({ models: MODEL_CAPABILITIES });
  }

  if (section === "health") {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    const mongoData = await getMongoAnalytics(24);
    return NextResponse.json({
      status: "ok",
      uptime: `${uptime.toFixed(0)}s`,
      memory: { heapUsed: `${(mem.heapUsed / 1048576).toFixed(1)}MB`, heapTotal: `${(mem.heapTotal / 1048576).toFixed(1)}MB` },
      cache: responseCache.stats,
      rateLimiter: globalLimiter.stats,
      breakers: Object.keys(getBreakerStats()).length,
      persistent: mongoData || "MongoDB not available",
    });
  }

  if (section === "persistent") {
    const hours = Number(url.searchParams.get("hours")) || 24;
    const data = await getMongoAnalytics(hours);
    if (!data) {
      return NextResponse.json({ error: "MongoDB not available" }, { status: 503 });
    }
    return NextResponse.json(data);
  }

  const inMemory = getAnalytics();
  const persistent = await getMongoAnalytics(24);
  return NextResponse.json({ inMemory, persistent });
}

export async function DELETE() {
  clearAnalytics();
  responseCache.clear();
  return NextResponse.json({ ok: true, message: "analytics and cache cleared" });
}
