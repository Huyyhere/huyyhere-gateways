import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { getAnalytics, getRecentLogs, getMongoAnalytics } from "@/lib/analytics";
import { responseCache } from "@/lib/cache";
import { getBreakerStats } from "@/lib/circuit-breaker";
import { globalLimiter } from "@/lib/rate-limiter";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const analytics = getAnalytics();
  const cache = responseCache.stats;
  const breakers = getBreakerStats();
  const limiter = globalLimiter.stats;
  const mongo = await getMongoAnalytics(24);

  return Response.json({
    summary: analytics.summary,
    models: analytics.models,
    hourly: analytics.hourly,
    recentErrors: analytics.recentErrors,
    cache: { entries: cache.entries, bytes: cache.bytes },
    breakers,
    rateLimiter: { keys: limiter.keys },
    mongo24h: mongo,
  }, { headers: secureHeaders() });
}
