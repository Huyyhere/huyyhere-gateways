import crypto from "crypto";

function splitKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

function resolveGatewayApiKey(): string {
  if (process.env.GATEWAY_API_KEY) return process.env.GATEWAY_API_KEY;
  const generated = `gw-${crypto.randomBytes(24).toString("hex")}`;
  console.log(`[ai-gateway] GATEWAY_API_KEY not set, generated: ${generated}`);
  return generated;
}

export type ProviderName = "aibox" | "claude" | "kimi";

const defaults = {
  model: "deepseek-v4-pro",
  baseUrl: "",
  contextWindow: 262_144,
};

const claudeDefaults = {
  model: "claude-opus-4-7",
  baseUrl: "",
  contextWindow: 200_000,
};

const kimiDefaults = {
  model: "kimi-k2.5",
  baseUrl: "",
  contextWindow: 128_000,
};

const globalForModels = globalThis as unknown as {
  __aiGatewayModelMap?: Record<string, ProviderName>;
};

export const modelMap: Record<string, ProviderName> =
  globalForModels.__aiGatewayModelMap || (globalForModels.__aiGatewayModelMap = {
    "deepseek-v4-pro": "aibox",
    "claude-opus-4-7": "claude",
    "kimi-k2.5": "kimi",
    "gemini-2.5-flash": "claude",
  });

export const config = {
  gatewayApiKey: resolveGatewayApiKey(),
  displayModelName: process.env.DISPLAY_MODEL || "deepseek-v4-pro",
  providerOrder: (process.env.PROVIDER_ORDER || "aibox,claude,kimi").split(",") as ProviderName[],
  providers: {
    aibox: {
      keys: splitKeys(process.env.AIBOX_KEYS),
      model: process.env.AIBOX_MODEL || defaults.model,
      baseUrl: process.env.AIBOX_BASE_URL || defaults.baseUrl,
      contextWindow: Number(process.env.AIBOX_CONTEXT_WINDOW) || defaults.contextWindow,
    },
    claude: {
      keys: splitKeys(process.env.CLAUDE_KEYS),
      model: process.env.CLAUDE_MODEL || claudeDefaults.model,
      baseUrl: process.env.CLAUDE_BASE_URL || claudeDefaults.baseUrl,
      contextWindow: Number(process.env.CLAUDE_CONTEXT_WINDOW) || claudeDefaults.contextWindow,
    },
    kimi: {
      keys: splitKeys(process.env.KIMI_KEYS),
      model: process.env.KIMI_MODEL || kimiDefaults.model,
      baseUrl: process.env.KIMI_BASE_URL || process.env.CLAUDE_BASE_URL || claudeDefaults.baseUrl,
      contextWindow: Number(process.env.KIMI_CONTEXT_WINDOW) || kimiDefaults.contextWindow,
    },
  },
};
