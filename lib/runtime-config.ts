import { getDb } from "./mongo";

interface GatewayConfig {
  rateLimit: { global: number; perKey: number };
  cache: { enabled: boolean; maxEntries: number };
  circuitBreaker: { cooldownBase: number; maxCooldown: number; threshold: number };
  autoModel: { preferCheap: boolean; maxRounds: number };
}

const DEFAULT_CONFIG: GatewayConfig = {
  rateLimit: { global: 60, perKey: 120 },
  cache: { enabled: true, maxEntries: 1000 },
  circuitBreaker: { cooldownBase: 10000, maxCooldown: 300000, threshold: 3 },
  autoModel: { preferCheap: false, maxRounds: 3 },
};

let cachedConfig: GatewayConfig | null = null;
let lastFetch = 0;
const CONFIG_TTL = 60_000; // 1 min

export async function getConfig(): Promise<GatewayConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastFetch < CONFIG_TTL) return cachedConfig;
  try {
    const db = await getDb();
    const doc = await db.collection("config").findOne({ _id: "gateway" as any });
    if (doc) {
      const { _id, ...rest } = doc;
      cachedConfig = { ...DEFAULT_CONFIG, ...rest } as GatewayConfig;
    } else {
      cachedConfig = DEFAULT_CONFIG;
    }
  } catch {
    cachedConfig = cachedConfig || DEFAULT_CONFIG;
  }
  lastFetch = now;
  return cachedConfig;
}
