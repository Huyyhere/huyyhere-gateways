import { config, ProviderName, modelMap } from "./config";
import { KeyPool, maskKey } from "./keyPool";
import { callOpenAICompatible } from "./adapters/openaiCompatible";
import { streamOpenAICompatible } from "./adapters/openaiCompatibleStream";
import "./autoRefreshInit";

import {
  AdapterResult,
  ChatRequest,
  NonRetryableError,
  ProviderError,
  StreamDelta,
  isNonRetryableStatus,
  isTransientStatus,
} from "./types";
import { logger } from "./logger";
import { estimateTokens } from "./estimateTokens";
import { sessionKeyFor, getStickyProvider, setStickyProvider } from "./sessionAffinity";
import { isCircuitOpen, tripCircuit, resetCircuit } from "./providerCircuit";

const RETRY_ROUNDS = Number(process.env.GATEWAY_RETRY_ROUNDS || 4);
const RETRY_WAIT_MS = Number(process.env.GATEWAY_RETRY_WAIT_MS || 5000);

const globalForPools = globalThis as unknown as {
  __aiGatewayPools?: Record<ProviderName, KeyPool>;
};

function buildPools(): Record<ProviderName, KeyPool> {
  const pools = {} as Record<ProviderName, KeyPool>;
  for (const name of Object.keys(config.providers) as ProviderName[]) {
    pools[name] = new KeyPool(config.providers[name].keys);
  }
  return pools;
}

const pools: Record<ProviderName, KeyPool> =
  globalForPools.__aiGatewayPools || (globalForPools.__aiGatewayPools = buildPools());

type Caller<T> = (req: ChatRequest, key: string, model: string, baseUrl: string) => Promise<T>;

const callers: Record<ProviderName, Caller<AdapterResult>> = {
  aibox: (req, key, model, baseUrl) => callOpenAICompatible(req, key, model, baseUrl),
  claude: (req, key, model, baseUrl) => callOpenAICompatible(req, key, model, baseUrl),
};

interface StreamStart {
  generator: AsyncGenerator<StreamDelta>;
  first: StreamDelta;
}

async function startStream(generator: AsyncGenerator<StreamDelta>): Promise<StreamStart> {
  const first = await generator.next();
  return { generator, first: first.done ? {} : first.value };
}

const streamCallers: Record<ProviderName, Caller<StreamStart>> = {
  aibox: (req, key, model, baseUrl) =>
    startStream(streamOpenAICompatible(req, key, model, baseUrl)),
  claude: (req, key, model, baseUrl) =>
    startStream(streamOpenAICompatible(req, key, model, baseUrl)),
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function orderedProviders(req: ChatRequest): Promise<ProviderName[]> {
  const mapped = req.model ? modelMap[req.model] : undefined;
  if (mapped && config.providerOrder.includes(mapped)) {
    return [mapped];
  }
  const sticky = await getStickyProvider(sessionKeyFor(req));
  if (!sticky || !config.providerOrder.includes(sticky)) return config.providerOrder;
  return [sticky, ...config.providerOrder.filter((p) => p !== sticky)];
}

interface PassSuccess<T> {
  provider: ProviderName;
  model: string;
  value: T;
}

async function runPassOnce<T>(
  req: ChatRequest,
  callerMap: Record<ProviderName, Caller<T>>
): Promise<{ success: PassSuccess<T> | null; errors: string[] }> {
  const errors: string[] = [];
  const estimatedTokens = estimateTokens(req.messages);

  for (const provider of await orderedProviders(req)) {
    const pool = pools[provider];
    const providerConfig = config.providers[provider];
    if (!pool || !providerConfig || pool.size() === 0 || !providerConfig.baseUrl) continue;

    if (isCircuitOpen(provider)) {
      logger.fail(provider, "bỏ qua: circuit breaker đang mở (provider vừa outage)");
      errors.push(`${provider}:circuit_open`);
      continue;
    }

    if (estimatedTokens > providerConfig.contextWindow * 0.9) {
      logger.fail(
        provider,
        `bỏ qua: hội thoại ~${estimatedTokens} token vượt context ${providerConfig.contextWindow}`
      );
      errors.push(`${provider}:context_too_small`);
      continue;
    }

    const { model, baseUrl } = providerConfig;
    const attempts = pool.size();
    let hadHardFailure = false;

    for (let i = 0; i < attempts; i++) {
      const key = pool.next();
      if (!key) break;

      const keyPreview = maskKey(key);
      logger.attempt(provider, model, keyPreview);

      try {
        const value = await callerMap[provider](req, key, model, baseUrl);
        pool.markSuccess(key);
        resetCircuit(provider);
        await setStickyProvider(sessionKeyFor(req), provider);
        return { success: { provider, model, value }, errors };
      } catch (err) {
        if (err instanceof ProviderError) {
          if (isNonRetryableStatus(err.status)) {
            throw new NonRetryableError(`${provider}: ${err.message}`, err.status);
          }
          if (isTransientStatus(err.status)) {
            const cooldownMs = pool.markCooldown(key, err.retryAfterMs);
            logger.cooldown(provider, keyPreview, cooldownMs, `HTTP ${err.status}`);
            errors.push(`${provider}:${err.status}`);
            if (err.status !== 429) hadHardFailure = true;
            continue;
          }
          logger.fail(provider, `key có thể sai/hết hạn - HTTP ${err.status} - ${err.message}`);
          pool.markCooldown(key, 60_000);
          errors.push(`${provider}:${err.status}:${err.message}`);
          continue;
        }
        const message = (err as Error).message;
        logger.fail(provider, `lỗi mạng/timeout: ${message}`);
        errors.push(`${provider}:unknown:${message}`);
        hadHardFailure = true;
        continue;
      }
    }

    if (hadHardFailure) {
      tripCircuit(provider);
      logger.fail(provider, "mở circuit breaker 20s do lỗi server/timeout liên tục");
    }
  }

  return { success: null, errors };
}

async function runWithRounds<T>(
  req: ChatRequest,
  callerMap: Record<ProviderName, Caller<T>>
): Promise<PassSuccess<T>> {
  let lastErrors: string[] = [];

  for (let round = 1; round <= RETRY_ROUNDS; round++) {
    const { success, errors } = await runPassOnce(req, callerMap);
    if (success) return success;
    lastErrors = errors;

    if (round < RETRY_ROUNDS) {
      logger.fail(
        "gateway",
        `vòng ${round}/${RETRY_ROUNDS} tất cả provider đều bận, đợi ${
          RETRY_WAIT_MS / 1000
        }s rồi thử lại thay vì trả lỗi ngay...`
      );
      await sleep(RETRY_WAIT_MS);
    }
  }

  logger.exhausted(lastErrors);
  throw new Error(`all_providers_exhausted_after_${RETRY_ROUNDS}_rounds: ${lastErrors.join(" | ")}`);
}

export interface RouteResult extends AdapterResult {
  provider: ProviderName;
  model: string;
}

export async function routeChat(req: ChatRequest): Promise<RouteResult> {
  const startedAt = Date.now();
  const { provider, model, value } = await runWithRounds(req, callers);
  logger.success(provider, model, Date.now() - startedAt, value.usage);
  return { ...value, provider, model };
}

export interface StreamRouteResult {
  provider: ProviderName;
  model: string;
  first: StreamDelta;
  generator: AsyncGenerator<StreamDelta>;
}

export async function routeChatStream(req: ChatRequest): Promise<StreamRouteResult> {
  const startedAt = Date.now();
  const { provider, model, value } = await runWithRounds(req, streamCallers);
  logger.success(provider, model, Date.now() - startedAt, {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  });
  return { provider, model, first: value.first, generator: value.generator };
}

export interface ProviderStatus {
  provider: ProviderName;
  model: string;
  enabled: boolean;
  totalKeys: number;
  availableKeys: number;
}

export function getStatus(): ProviderStatus[] {
  return config.providerOrder.map((provider) => {
    const pool = pools[provider];
    const providerConfig = config.providers[provider];
    return {
      provider,
      model: providerConfig?.model ?? "",
      enabled: Boolean(providerConfig?.baseUrl) && (pool?.size() ?? 0) > 0,
      totalKeys: pool?.size() ?? 0,
      availableKeys: pool?.availableCount() ?? 0,
    };
  });
}
