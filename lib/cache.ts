interface CacheEntry {
  value: string;
  expiresAt: number;
  size: number;
}

export class LRUCache {
  private store = new Map<string, CacheEntry>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize = 500, defaultTTL = 300_000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  private evict() {
    if (this.store.size <= this.maxSize) return;
    const oldest = this.store.keys().next().value;
    if (oldest) this.store.delete(oldest);
  }

  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string, ttl = this.defaultTTL) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttl, size: value.length });
    this.evict();
  }

  delete(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }

  get stats() {
    let totalSize = 0;
    for (const e of this.store.values()) totalSize += e.size;
    return { entries: this.store.size, bytes: totalSize };
  }
}

function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: { type?: string }) => p.type === "text")
      .map((p: { text?: string }) => p.text || "")
      .join("\n");
  }
  return "";
}

// `scope` should be a per-caller identifier (API key, or "owner"/"anon") so that
// two different callers never share a cached response, even for identical prompts.
export function buildCacheKey(body: Record<string, unknown>, scope: string): string {
  const messages = (body.messages || []) as { role: string; content: unknown }[];
  const key = {
    scope,
    m: body.model,
    t: messages.map((m) => ({ r: m.role, c: getMessageText(m.content) })),
    temp: body.temperature,
  };
  // Use the JSON string itself as the map key. Map keys are hashed internally by
  // the JS engine, so there's no need for (and no collision risk from) a manual hash.
  return JSON.stringify(key);
}

export const responseCache = new LRUCache(
  Number(process.env.CACHE_MAX_ENTRIES) || 500,
  Number(process.env.CACHE_TTL_MS) || 300_000
);
