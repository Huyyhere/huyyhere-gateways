interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

export class SlidingWindowRateLimiter {
  private windows = new Map<string, Window>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 60, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    let window = this.windows.get(key);

    if (!window || now > window.resetAt) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }

    window.count++;
    const allowed = window.count <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - window.count);
    const retryAfter = allowed ? 0 : Math.ceil((window.resetAt - now) / 1000);

    return { allowed, remaining, resetAt: window.resetAt, retryAfter };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (now > window.resetAt) this.windows.delete(key);
    }
  }

  get stats() {
    return { keys: this.windows.size };
  }
}

export const globalLimiter = new SlidingWindowRateLimiter(
  Number(process.env.RATE_LIMIT_MAX) || 60,
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000
);

const perKeyLimiters = new Map<string, SlidingWindowRateLimiter>();
const PER_KEY_MAX = 120;

export function getKeyLimiter(key: string, limit = PER_KEY_MAX): SlidingWindowRateLimiter {
  let limiter = perKeyLimiters.get(key);
  if (!limiter) {
    limiter = new SlidingWindowRateLimiter(limit, 60_000);
    perKeyLimiters.set(key, limiter);
  }
  return limiter;
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startRateLimiterCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    globalLimiter.cleanup();
    for (const [key, limiter] of perKeyLimiters) {
      limiter.cleanup();
      if (limiter.stats.keys === 0) perKeyLimiters.delete(key);
    }
  }, 120_000);
  if (cleanupInterval.unref) cleanupInterval.unref();
}
