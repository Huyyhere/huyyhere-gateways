export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  streaming: boolean;
  contextLength: number;
  maxOutput: number;
  input: number;
  output: number;
}

export const MODEL_IDS = [
  "auto",
  "mimo-code-free",
  "kimi-k2.7-code", "minimax-m3", "kimi-k2.6",
  "deepseek-v4-pro",
  "glm-5.2", "grok-4.5",
  "glm-4.7-flash", "glm-4.5-flash",
  "eh-gpt-4.1", "eh-claude-3.5-sonnet",
  "naga-nemotron-3-ultra",
  "navy-gpt-4.1",
  "mnn-gpt-4.1",
  "mistral-small",
  "or-llama-3.1-8b",
  "samba-deepseek-v3.2",
  "together-llama-3.1-8b",
  "cohere-command-r-plus",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export const MODEL_LIST = MODEL_IDS.map((id) => ({
  id,
  object: "model" as const,
  created: 1700000000,
}));

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  auto:              { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "mimo-code-free":  { vision: false, tools: true,  streaming: true, contextLength: 32000,  maxOutput: 8192,  input: 0, output: 0 },
  "kimi-k2.7-code":  { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "minimax-m3":      { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "kimi-k2.6":       { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "deepseek-v4-pro": { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "glm-5.2":         { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "grok-4.5":        { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "glm-4.7-flash":   { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 8192,  input: 0, output: 0 },
  "glm-4.5-flash":   { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 8192,  input: 0, output: 0 },
  "eh-gpt-4.1":            { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "eh-claude-3.5-sonnet":  { vision: true,  tools: true,  streaming: true, contextLength: 200000, maxOutput: 8192,  input: 0, output: 0 },
  "naga-nemotron-3-ultra": { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 8192,  input: 0, output: 0 },
  "navy-gpt-4.1":          { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "mnn-gpt-4.1":           { vision: true,  tools: true,  streaming: true, contextLength: 128000, maxOutput: 16384, input: 0, output: 0 },
  "mistral-small":         { vision: false, tools: true,  streaming: true, contextLength: 32000,  maxOutput: 8192,  input: 0, output: 0 },
  "or-llama-3.1-8b":            { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 8192,  input: 0, output: 0 },
  "samba-deepseek-v3.2":         { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 8192,  input: 0, output: 0 },
  "together-llama-3.1-8b":       { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 8192,  input: 0, output: 0 },
  "cohere-command-r-plus":       { vision: false, tools: true,  streaming: true, contextLength: 128000, maxOutput: 4096,  input: 0, output: 0 },
};

export function getModelCapabilities(modelId: string): ModelCapabilities | undefined {
  return MODEL_CAPABILITIES[modelId];
}

export function supportsVision(modelId: string): boolean {
  return MODEL_CAPABILITIES[modelId]?.vision ?? false;
}

export function getVisionModels(): string[] {
  return Object.entries(MODEL_CAPABILITIES)
    .filter(([id, c]) => c.vision && id !== "auto")
    .map(([id]) => id);
}

export function getKeyPool(prefix: string): string[] {
  const keys: string[] = [];
  let i = 1;
  while (process.env[`${prefix}_API_KEY_${i}`]) {
    keys.push(process.env[`${prefix}_API_KEY_${i}`]!);
    i++;
  }
  if (process.env[`${prefix}_API_KEY`]) keys.push(process.env[`${prefix}_API_KEY`]!);
  return keys;
}

export const FALLBACK_ORDER = [
  "kimi-k2.7-code", "minimax-m3", "mimo-code-free",
  "deepseek-v4-pro", "kimi-k2.6",
  "glm-5.2", "grok-4.5",
  "glm-4.7-flash", "glm-4.5-flash",
  "eh-gpt-4.1", "eh-claude-3.5-sonnet",
  "navy-gpt-4.1", "mnn-gpt-4.1",
  "naga-nemotron-3-ultra", "mistral-small",
  "or-llama-3.1-8b", "together-llama-3.1-8b", "samba-deepseek-v3.2",
  "cohere-command-r-plus",
];
