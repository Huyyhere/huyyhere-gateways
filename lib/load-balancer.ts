type Strategy = "round-robin" | "least-connections" | "weighted" | "latency";

interface Backend {
  id: string;
  weight: number;
  activeConnections: number;
  totalLatency: number;
  requestCount: number;
  healthy: boolean;
}

const backends = new Map<string, Backend[]>();
const rrIndex = new Map<string, number>();

export function registerBackends(group: string, ids: string[], weights?: number[]) {
  const list = ids.map((id, i) => ({
    id, weight: weights?.[i] || 1, activeConnections: 0,
    totalLatency: 0, requestCount: 0, healthy: true,
  }));
  backends.set(group, list);
}

export function selectBackend(group: string, strategy: Strategy = "latency"): string | null {
  const list = backends.get(group)?.filter(b => b.healthy);
  if (!list?.length) return null;

  switch (strategy) {
    case "round-robin": {
      const idx = rrIndex.get(group) || 0;
      const selected = list[idx % list.length];
      rrIndex.set(group, idx + 1);
      return selected.id;
    }
    case "least-connections": {
      return list.reduce((min, b) => b.activeConnections < min.activeConnections ? b : min).id;
    }
    case "weighted": {
      const total = list.reduce((s, b) => s + b.weight, 0);
      let r = Math.random() * total;
      for (const b of list) { r -= b.weight; if (r <= 0) return b.id; }
      return list[0].id;
    }
    case "latency": {
      return list.reduce((best, b) => {
        const avg = b.requestCount > 0 ? b.totalLatency / b.requestCount : Infinity;
        const bestAvg = best.requestCount > 0 ? best.totalLatency / best.requestCount : Infinity;
        return avg < bestAvg ? b : best;
      }).id;
    }
  }
}

export function recordRequest(group: string, id: string, latencyMs: number) {
  const list = backends.get(group);
  const b = list?.find(b => b.id === id);
  if (b) {
    b.activeConnections++;
    b.totalLatency += latencyMs;
    b.requestCount++;
  }
}

export function recordComplete(group: string, id: string) {
  const list = backends.get(group);
  const b = list?.find(b => b.id === id);
  if (b) b.activeConnections = Math.max(0, b.activeConnections - 1);
}

export function setHealth(group: string, id: string, healthy: boolean) {
  const list = backends.get(group);
  const b = list?.find(b => b.id === id);
  if (b) b.healthy = healthy;
}

export function getLoadBalancerStats() {
  const result: Record<string, Array<Backend & { avgLatency: number }>> = {};
  for (const [group, list] of backends) {
    result[group] = list.map(b => ({
      ...b,
      avgLatency: b.requestCount > 0 ? Math.round(b.totalLatency / b.requestCount) : 0,
    }));
  }
  return result;
}
