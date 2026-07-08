import { ProviderName } from "./config";

const CIRCUIT_OPEN_MS = 20_000;

const globalForCircuit = globalThis as unknown as {
  __aiGatewayCircuit?: Map<ProviderName, number>;
};

const store: Map<ProviderName, number> =
  globalForCircuit.__aiGatewayCircuit || (globalForCircuit.__aiGatewayCircuit = new Map());

export function isCircuitOpen(provider: ProviderName): boolean {
  const until = store.get(provider);
  return Boolean(until && until > Date.now());
}

export function tripCircuit(provider: ProviderName) {
  store.set(provider, Date.now() + CIRCUIT_OPEN_MS);
}

export function resetCircuit(provider: ProviderName) {
  store.delete(provider);
}
