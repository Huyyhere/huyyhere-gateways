interface CachedPrompt {
  response: string;
  expiresAt: number;
}

const cache = new Map<string, CachedPrompt>();
const DEFAULT_TTL = 300_000;

function promptKey(scope: string, system: string, userPrefix: string): string {
  return `${scope}::${system}::${userPrefix.slice(0, 200)}`;
}

// `scope` should be a per-caller identifier (API key, or "owner"/"anon") so cached
// responses are never shared between different callers.
export function promptCacheGet(scope: string, system: string, userMessage: string): string | null {
  if (!system) return null;
  const key = promptKey(scope, system, userMessage);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.response;
}

export function promptCacheSet(scope: string, system: string, userMessage: string, response: string, ttl = DEFAULT_TTL) {
  if (!system) return;
  const key = promptKey(scope, system, userMessage);
  cache.set(key, { response, expiresAt: Date.now() + ttl });
}

export function promptCacheStats() {
  return { entries: cache.size };
}
