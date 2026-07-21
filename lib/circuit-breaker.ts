type State = "closed" | "open" | "half-open";

interface BreakerState {
  state: State;
  failCount: number;
  lastFail: number;
  nextAttempt: number;
}

const breakers = new Map<string, BreakerState>();
const COOLDOWN_BASE = 10_000;
const MAX_COOLDOWN = 300_000;

export function isCircuitOpen(key: string): boolean {
  const b = breakers.get(key);
  if (!b || b.state === "closed") return false;
  if (Date.now() > b.nextAttempt) {
    b.state = "half-open";
    return false;
  }
  return true;
}

export function recordFail(key: string) {
  const now = Date.now();
  let b = breakers.get(key);
  if (!b) {
    b = { state: "closed", failCount: 0, lastFail: 0, nextAttempt: 0 };
    breakers.set(key, b);
  }
  b.failCount++;
  b.lastFail = now;

  if (b.state === "half-open" || b.failCount >= 3) {
    b.state = "open";
    const backoff = Math.min(COOLDOWN_BASE * Math.pow(2, b.failCount - 3), MAX_COOLDOWN);
    b.nextAttempt = now + backoff;
  }
}

export function recordSuccess(key: string) {
  const b = breakers.get(key);
  if (!b) return;
  b.state = "closed";
  b.failCount = 0;
  b.lastFail = 0;
  b.nextAttempt = 0;
}

export function resetBreaker(key: string) {
  breakers.delete(key);
}

export function getBreakerStats() {
  const stats: Record<string, { state: State; failCount: number; nextAttempt: number }> = {};
  for (const [key, b] of breakers) {
    stats[key] = { state: b.state, failCount: b.failCount, nextAttempt: b.nextAttempt };
  }
  return stats;
}
