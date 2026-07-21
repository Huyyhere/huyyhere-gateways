export interface ProviderConfig {
  url: string;
  testModel: string;
  signup: string;
  noKey?: boolean;
  imageGen?: boolean;
  envPrefix?: string;
  // Most OpenAI-compatible providers support /v1/models endpoint
  // Set to false if the provider doesn't support it
  supportsListModels?: boolean;
}

export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  BlackCat: {
    url: `${process.env.BLACKCAT_BASE_URL}/chat/completions`,
    testModel: "mimo-code-free",
    signup: "internal",
    envPrefix: "BLACKCAT",
    supportsListModels: true,
  },
  ZLKPro: {
    url: `${process.env.ZLKPRO_BASE_URL}/chat/completions`,
    testModel: "kimi-k2.7-code",
    signup: "internal",
    envPrefix: "ZLKPRO",
    supportsListModels: true,
  },
  Venuses: {
    url: `${process.env.VENESES_BASE_URL}/chat/completions`,
    testModel: "glm-5.2",
    signup: "internal",
    envPrefix: "VENESES",
    supportsListModels: true,
  },
  "Z.AI": {
    url: `${process.env.ZAI_BASE_URL}/chat/completions`,
    testModel: "glm-4.5-flash",
    signup: "https://z.ai",
    envPrefix: "ZAI",
    supportsListModels: true,
  },
  "Stability AI": {
    url: `${process.env.STABILITY_BASE_URL}/v1/generation/${process.env.STABILITY_ENGINE}/text-to-image`,
    testModel: "n/a",
    signup: "https://platform.stability.ai",
    imageGen: true,
    envPrefix: "STABILITY",
    supportsListModels: false,
  },
  ElectronHub: {
    url: "https://api.electronhub.ai/v1/chat/completions",
    testModel: "gpt-4.1",
    signup: "https://discord.gg/4xg2TM3mNP",
    envPrefix: "ELECTRONHUB",
    supportsListModels: true,
  },
  NagaAI: {
    url: "https://api.naga.ac/v1/chat/completions",
    testModel: "nemotron-3-ultra-550b-a55b:free",
    signup: "https://naga.ac/auth/sign-up",
    envPrefix: "NAGAAI",
    supportsListModels: true,
  },
  NavyAI: {
    url: "https://api.navy/v1/chat/completions",
    testModel: "gpt-4.1",
    signup: "https://discord.gg/ezXZ8wpprc",
    envPrefix: "NAVYAI",
    supportsListModels: true,
  },
  MNN: {
    url: "https://api.mnnai.ru/v1/chat/completions",
    testModel: "gpt-4.1",
    signup: "https://discord.gg/xKmsCCzUFW",
    envPrefix: "MNN",
    supportsListModels: true,
  },
  Mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    testModel: "mistral-tiny",
    signup: "https://console.mistral.ai",
    envPrefix: "MISTRAL",
    supportsListModels: true,
  },
  OpenRouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    testModel: "meta-llama/llama-3.1-8b-instruct:free",
    signup: "https://openrouter.ai/auth/signup",
    envPrefix: "OPENROUTER",
    supportsListModels: true,
  },
  SambaNova: {
    url: "https://api.sambanova.ai/v1/chat/completions",
    testModel: "DeepSeek-V3.2",
    signup: "https://cloud.sambanova.ai",
    envPrefix: "SAMBANOVA",
    supportsListModels: true,
  },
  Together: {
    url: "https://api.together.xyz/v1/chat/completions",
    testModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    signup: "https://api.together.xyz",
    envPrefix: "TOGETHER",
    supportsListModels: true,
  },
  Cohere: {
    url: "https://api.cohere.ai/compatibility/v1/chat/completions",
    testModel: "command-r-plus",
    signup: "https://cohere.com",
    envPrefix: "COHERE",
    supportsListModels: true,
  },
};

// Get base URL for a provider (without /chat/completions suffix)
export function getProviderBaseUrl(provider: string): string {
  const config = PROVIDER_REGISTRY[provider];
  if (!config) return "";
  return config.url.replace("/chat/completions", "");
}
