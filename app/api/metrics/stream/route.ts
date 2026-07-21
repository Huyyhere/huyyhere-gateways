import { NextRequest } from "next/server";
import { getAnalytics } from "@/lib/analytics";
import { responseCache } from "@/lib/cache";
import { getBreakerStats } from "@/lib/circuit-breaker";
import { globalLimiter } from "@/lib/rate-limiter";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const analytics = getAnalytics();
        const cache = responseCache.stats;
        const breakers = getBreakerStats();
        const limiter = globalLimiter.stats;

        const data = JSON.stringify({
          timestamp: Date.now(),
          summary: analytics.summary,
          models: analytics.models,
          cache,
          breakers,
          rateLimiter: limiter,
          hourly: analytics.hourly,
        });

        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      send();
      const interval = setInterval(send, 2000);
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
