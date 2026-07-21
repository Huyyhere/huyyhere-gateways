import { getKeyPool } from "./models";
import { getEnabledModels } from "./provider-keys";
import { PROVIDER_REGISTRY, getProviderBaseUrl } from "./provider-registry";
import { recordRequest, recordComplete } from "./load-balancer";

export interface ModelRoute {
  baseUrl: string;
  getApiKey: () => string;
  getApiKeys: () => string[];
  model: string;
  provider: string;
}

const keyUsage = new Map<string, number>();
const keyLastFail = new Map<string, number>();
const KEY_COOLDOWN = 30_000;
const UPSTREAM_TIMEOUT = 60_000;

export function selectKey(keys: string[]): string {
  return selectKeys(keys, 1)[0] || "";
}

export function selectKeys(keys: string[], maxTries = 3): string[] {
  if (keys.length === 0) return [];
  if (keys.length === 1) return [keys[0]];
  const now = Date.now();
  const available = keys.filter((k) => now - (keyLastFail.get(k) || 0) > KEY_COOLDOWN);
  const pool = available.length > 0 ? available : keys;
  const sorted = [...pool].sort((a, b) => (keyUsage.get(a) || 0) - (keyUsage.get(b) || 0));
  const picked = sorted.slice(0, Math.min(maxTries, sorted.length));
  for (const k of picked) keyUsage.set(k, (keyUsage.get(k) || 0) + 1);
  return picked;
}

export function markKeyFailed(key: string) {
  keyLastFail.set(key, Date.now());
}

interface ProviderKeyEntry {
  provider: string;
  apiKey: string;
  baseUrl: string;
}

export function buildModelRoutes(): Record<string, ModelRoute> {
  const routes: Record<string, ModelRoute> = {};
  const enabledModels = getEnabledModels();

  // Collect all keys per model ID across providers
  const modelProviders = new Map<string, ProviderKeyEntry[]>();

  for (const [provider, modelIds] of Object.entries(enabledModels)) {
    const config = PROVIDER_REGISTRY[provider];
    if (!config) continue;

    const baseUrl = getProviderBaseUrl(provider);
    const keys = getKeyPool(config.envPrefix || "");

    for (const modelId of modelIds) {
      if (!modelProviders.has(modelId)) {
        modelProviders.set(modelId, []);
      }
      // Add all keys for this provider
      for (const key of keys) {
        modelProviders.get(modelId)!.push({ provider, apiKey: key, baseUrl });
      }
    }
  }

  // Build routes - same model ID from different providers = fallback
  for (const [modelId, entries] of modelProviders) {
    if (entries.length === 0) continue;

    // Use the first provider's base URL as primary
    const primary = entries[0];
    const allKeys = entries.map((e) => e.apiKey);

    routes[modelId] = {
      baseUrl: primary.baseUrl,
      getApiKey: () => selectKey(allKeys),
      getApiKeys: () => selectKeys(allKeys),
      model: modelId,
      provider: primary.provider,
    };
  }

  return routes;
}

export async function callUpstream(
  route: ModelRoute,
  body: Record<string, unknown>
): Promise<Response> {
  const keys = route.getApiKeys();
  let lastError = "";
  const startTime = Date.now();
  const provider = route.provider;

  for (const key of keys) {
    try {
      const res = await fetch(`${route.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ ...body, model: route.model }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
      });

      if (res.ok) {
        recordRequest(provider, route.model, Date.now() - startTime);
        recordComplete(provider, route.model);
        return res;
      }

      lastError = `Key ...${key.slice(-8)}: ${res.status}`;
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        markKeyFailed(key);
        continue;
      }
      throw new Error(lastError);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (keys.length === 1) throw e;
    }
  }

  recordComplete(provider, route.model);
  throw new Error(`All keys failed. Last: ${lastError}`);
}
