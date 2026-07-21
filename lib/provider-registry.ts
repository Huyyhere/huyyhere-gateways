export interface ProviderConfig {
  url: string;
  testModel: string;
  freeModels: string[];
  signup: string;
  noKey?: boolean;
  // Stability AI's test isn't a chat-completion call; handled specially in
  // provider-keys.ts's testProviderKey().
  imageGen?: boolean;
  // Set only for providers already wired into chat routing (lib/provider.ts).
  // Keys added here automatically become usable by the gateway without a
  // redeploy. Providers without envPrefix are stash/test-only for now.
  envPrefix?: string;
}

export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  BlackCat: {
    url: `${process.env.BLACKCAT_BASE_URL}/chat/completions`,
    testModel: process.env.BLACKCAT_MODEL || "mimo-code-free",
    freeModels: ["mimo-code-free"],
    signup: "internal",
    envPrefix: "BLACKCAT",
  },
  ZLKPro: {
    url: `${process.env.ZLKPRO_BASE_URL}/chat/completions`,
    testModel: "kimi-k2.7-code",
    freeModels: ["kimi-k2.7-code", "minimax-m3", "kimi-k2.6", "deepseek-v4-pro"],
    signup: "internal",
    envPrefix: "ZLKPRO",
  },
  Venuses: {
    url: `${process.env.VENESES_BASE_URL}/chat/completions`,
    testModel: process.env.VENESES_MODEL_GLM_5_2 || "glm-5.2",
    freeModels: ["glm-5.2", "grok-4.5"],
    signup: "internal",
    envPrefix: "VENESES",
  },
  "Z.AI": {
    url: `${process.env.ZAI_BASE_URL}/chat/completions`,
    testModel: "glm-4.5-flash",
    freeModels: ["glm-4.7-flash", "glm-4.5-flash"],
    signup: "https://z.ai",
    envPrefix: "ZAI",
  },
  "Stability AI": {
    url: `${process.env.STABILITY_BASE_URL}/v1/generation/${process.env.STABILITY_ENGINE}/text-to-image`,
    testModel: "n/a",
    freeModels: ["stable-diffusion-xl"],
    signup: "https://platform.stability.ai",
    imageGen: true,
    envPrefix: "STABILITY",
  },
  ElectronHub: {
    url: "https://api.electronhub.ai/v1/chat/completions",
    testModel: "gpt-4.1",
    freeModels: ["gpt-4.1", "claude-3.5-sonnet", "gemini-2.5-pro", "deepseek-r1"],
    signup: "https://discord.gg/4xg2TM3mNP",
    envPrefix: "ELECTRONHUB",
  },
  NagaAI: {
    url: "https://api.naga.ac/v1/chat/completions",
    testModel: "nemotron-3-ultra-550b-a55b:free",
    freeModels: ["nemotron-3-ultra-550b-a55b:free", "llama-4-scout-17b-16e-instruct:free"],
    signup: "https://naga.ac/auth/sign-up",
    envPrefix: "NAGAAI",
  },
  NavyAI: {
    url: "https://api.navy/v1/chat/completions",
    testModel: "gpt-4.1",
    freeModels: ["gpt-4.1", "gemini-2.5-pro", "deepseek-r1", "claude-3.5-sonnet"],
    signup: "https://discord.gg/ezXZ8wpprc",
    envPrefix: "NAVYAI",
  },
  MNN: {
    url: "https://api.mnnai.ru/v1/chat/completions",
    testModel: "gpt-4.1",
    freeModels: ["gpt-4.1", "gemini-2.5-pro", "deepseek-r1"],
    signup: "https://discord.gg/xKmsCCzUFW",
    envPrefix: "MNN",
  },
  Mistral: {
    url: "https://api.mistral.ai/v1/chat/completions",
    testModel: "mistral-tiny",
    freeModels: ["mistral-tiny", "mistral-small-latest"],
    signup: "https://console.mistral.ai",
    envPrefix: "MISTRAL",
  },
  OpenRouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    testModel: "meta-llama/llama-3.1-8b-instruct:free",
    freeModels: ["meta-llama/llama-3.1-8b-instruct:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free"],
    signup: "https://openrouter.ai/auth/signup",
    envPrefix: "OPENROUTER",
  },
  SambaNova: {
    url: "https://api.sambanova.ai/v1/chat/completions",
    testModel: "DeepSeek-V3.2",
    freeModels: ["DeepSeek-V3.2", "Meta-Llama-3.3-70B-Instruct", "gemma-4-31B-it"],
    signup: "https://cloud.sambanova.ai",
    envPrefix: "SAMBANOVA",
  },
  Together: {
    url: "https://api.together.xyz/v1/chat/completions",
    testModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    freeModels: ["meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"],
    signup: "https://api.together.xyz",
    envPrefix: "TOGETHER",
  },
  Cohere: {
    // Cohere's classic /v1/chat uses a non-OpenAI shape (message vs messages).
    // Their official Compatibility API is a real drop-in OpenAI-shaped endpoint,
    // so we use that instead of the shape key_manager.py's config implied.
    url: "https://api.cohere.ai/compatibility/v1/chat/completions",
    testModel: "command-r-plus",
    freeModels: ["command-r", "command-r-plus"],
    signup: "https://cohere.com",
    envPrefix: "COHERE",
  },
};

