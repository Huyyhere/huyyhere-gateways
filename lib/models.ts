export interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  streaming: boolean;
  contextLength: number;
  maxOutput: number;
  input: number;
  output: number;
}

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {};

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

import { getDynamicKeysSync } from "./provider-keys";
import { PROVIDER_REGISTRY } from "./provider-registry";

const PREFIX_TO_PROVIDER: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_REGISTRY)
    .filter(([, cfg]) => cfg.envPrefix)
    .map(([name, cfg]) => [cfg.envPrefix!, name])
);

export function getKeyPool(prefix: string): string[] {
  const keys: string[] = [];
  let i = 1;
  while (process.env[`${prefix}_API_KEY_${i}`]) {
    keys.push(process.env[`${prefix}_API_KEY_${i}`]!);
    i++;
  }
  if (process.env[`${prefix}_API_KEY`]) keys.push(process.env[`${prefix}_API_KEY`]!);

  const providerName = PREFIX_TO_PROVIDER[prefix];
  if (providerName) keys.push(...getDynamicKeysSync(providerName));

  return keys;
}
