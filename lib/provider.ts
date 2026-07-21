import { getKeyPool } from "./models";
import { recordRequest, recordComplete } from "./load-balancer";

export interface ModelRoute {
  baseUrl: string;
  // Single least-used key. Use this for one-off calls (e.g. health checks).
  getApiKey: () => string;
  // Up to a few candidate keys (least-used, not in cooldown) for in-request
  // fallback. Use this when you want callUpstream-style retry behavior.
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

// Returns up to `maxTries` candidate keys (least-used, not in cooldown) so a
// single request can fall back across several keys, not just one.
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

export function buildModelRoutes(): Record<string, ModelRoute> {
  const routes: Record<string, ModelRoute> = {};

  // BlackCat - mimo-code-free
  const blackcatKeys = getKeyPool("BLACKCAT");
  routes["mimo-code-free"] = {
    baseUrl: process.env.BLACKCAT_BASE_URL!,
    getApiKey: () => selectKey(blackcatKeys),
    getApiKeys: () => selectKeys(blackcatKeys),
    model: process.env.BLACKCAT_MODEL!,
    provider: "blackcat",
  };

  // ZLKPro - 5 free coding models
  const zlkproKeys = getKeyPool("ZLKPRO");
  const zlk = process.env.ZLKPRO_BASE_URL!;
  const zlkRoute = (model: string): ModelRoute => ({
    baseUrl: zlk,
    getApiKey: () => selectKey(zlkproKeys),
    getApiKeys: () => selectKeys(zlkproKeys),
    model,
    provider: "zlkpro",
  });

  routes["kimi-k2.7-code"]   = zlkRoute("kimi-k2.7-code");
  routes["minimax-m3"]        = zlkRoute("minimax-m3");
  routes["kimi-k2.6"]         = zlkRoute("kimi-k2.6");
  routes["deepseek-v4-pro"]   = zlkRoute("deepseek-v4-pro");

  // Venuses - glm-5.2, grok-4.5 (may be under maintenance)
  const venusesKeys = getKeyPool("VENESES");
  const venuses = process.env.VENESES_BASE_URL!;
  routes["glm-5.2"] = {
    baseUrl: venuses,
    getApiKey: () => selectKey(venusesKeys),
    getApiKeys: () => selectKeys(venusesKeys),
    model: process.env.VENESES_MODEL_GLM_5_2!,
    provider: "venuses",
  };
  routes["grok-4.5"] = {
    baseUrl: venuses,
    getApiKey: () => selectKey(venusesKeys),
    getApiKeys: () => selectKeys(venusesKeys),
    model: process.env.VENESES_MODEL_GROK_4_5!,
    provider: "venuses",
  };

  // Z.AI - 3 free GLM flash models
  const zaiKeys = getKeyPool("ZAI");
  const zai = process.env.ZAI_BASE_URL!;
  const zaiRoute = (model: string): ModelRoute => ({
    baseUrl: zai,
    getApiKey: () => selectKey(zaiKeys),
    getApiKeys: () => selectKeys(zaiKeys),
    model,
    provider: "zai",
  });

  routes["glm-4.7-flash"]  = zaiRoute("glm-4.7-flash");
  routes["glm-4.5-flash"]  = zaiRoute("glm-4.5-flash");

  // ElectronHub - gpt-4.1, claude-3.5-sonnet (community reseller, unofficial)
  const ehKeys = getKeyPool("ELECTRONHUB");
  const eh = process.env.ELECTRONHUB_BASE_URL!;
  routes["eh-gpt-4.1"] = {
    baseUrl: eh,
    getApiKey: () => selectKey(ehKeys),
    getApiKeys: () => selectKeys(ehKeys),
    model: "gpt-4.1",
    provider: "electronhub",
  };
  routes["eh-claude-3.5-sonnet"] = {
    baseUrl: eh,
    getApiKey: () => selectKey(ehKeys),
    getApiKeys: () => selectKeys(ehKeys),
    model: "claude-3.5-sonnet",
    provider: "electronhub",
  };

  // NagaAI (community reseller, unofficial)
  const nagaKeys = getKeyPool("NAGAAI");
  routes["naga-nemotron-3-ultra"] = {
    baseUrl: process.env.NAGAAI_BASE_URL!,
    getApiKey: () => selectKey(nagaKeys),
    getApiKeys: () => selectKeys(nagaKeys),
    model: "nemotron-3-ultra-550b-a55b:free",
    provider: "nagaai",
  };

  // NavyAI (community reseller, unofficial)
  const navyKeys = getKeyPool("NAVYAI");
  routes["navy-gpt-4.1"] = {
    baseUrl: process.env.NAVYAI_BASE_URL!,
    getApiKey: () => selectKey(navyKeys),
    getApiKeys: () => selectKeys(navyKeys),
    model: "gpt-4.1",
    provider: "navyai",
  };

  // MNN (community reseller, unofficial)
  const mnnKeys = getKeyPool("MNN");
  routes["mnn-gpt-4.1"] = {
    baseUrl: process.env.MNN_BASE_URL!,
    getApiKey: () => selectKey(mnnKeys),
    getApiKeys: () => selectKeys(mnnKeys),
    model: "gpt-4.1",
    provider: "mnn",
  };

  // Mistral - official
  const mistralKeys = getKeyPool("MISTRAL");
  routes["mistral-small"] = {
    baseUrl: process.env.MISTRAL_BASE_URL!,
    getApiKey: () => selectKey(mistralKeys),
    getApiKeys: () => selectKeys(mistralKeys),
    model: "mistral-small-latest",
    provider: "mistral",
  };

  // OpenRouter - official
  const orKeys = getKeyPool("OPENROUTER");
  routes["or-llama-3.1-8b"] = {
    baseUrl: process.env.OPENROUTER_BASE_URL!,
    getApiKey: () => selectKey(orKeys),
    getApiKeys: () => selectKeys(orKeys),
    model: "meta-llama/llama-3.1-8b-instruct:free",
    provider: "openrouter",
  };

  // SambaNova - official
  const sambaKeys = getKeyPool("SAMBANOVA");
  routes["samba-deepseek-v3.2"] = {
    baseUrl: process.env.SAMBANOVA_BASE_URL!,
    getApiKey: () => selectKey(sambaKeys),
    getApiKeys: () => selectKeys(sambaKeys),
    model: "DeepSeek-V3.2",
    provider: "sambanova",
  };

  // Together - official
  const togetherKeys = getKeyPool("TOGETHER");
  routes["together-llama-3.1-8b"] = {
    baseUrl: process.env.TOGETHER_BASE_URL!,
    getApiKey: () => selectKey(togetherKeys),
    getApiKeys: () => selectKeys(togetherKeys),
    model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    provider: "together",
  };

  // Cohere - official Compatibility API (OpenAI-shaped)
  const cohereKeys = getKeyPool("COHERE");
  routes["cohere-command-r-plus"] = {
    baseUrl: process.env.COHERE_BASE_URL!,
    getApiKey: () => selectKey(cohereKeys),
    getApiKeys: () => selectKeys(cohereKeys),
    model: "command-r-plus",
    provider: "cohere",
  };

  // Pollinations - official (gen.pollinations.ai, OpenAI-shaped, needs a key now)
  const pollinationsKeys = getKeyPool("POLLINATIONS");
  routes["pollinations-openai"] = {
    baseUrl: process.env.POLLINATIONS_BASE_URL!,
    getApiKey: () => selectKey(pollinationsKeys),
    getApiKeys: () => selectKeys(pollinationsKeys),
    model: "openai",
    provider: "pollinations",
  };

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
