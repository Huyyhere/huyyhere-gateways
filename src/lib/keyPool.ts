interface KeyState {
  key: string;
  cooldownUntil: number;
  failCount: number;
}

const BASE_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 10 * 60_000;

export class KeyPool {
  private states: KeyState[];
  private cursor = 0;

  constructor(keys: string[]) {
    this.states = keys.map((key) => ({ key, cooldownUntil: 0, failCount: 0 }));
  }

  reset(keys: string[]) {
    this.states = keys.map((key) => ({ key, cooldownUntil: 0, failCount: 0 }));
    this.cursor = 0;
  }

  size() {
    return this.states.length;
  }

  availableCount() {
    const now = Date.now();
    return this.states.filter((s) => s.cooldownUntil <= now).length;
  }

  markSuccess(key: string) {
    const state = this.states.find((s) => s.key === key);
    if (state) state.failCount = 0;
  }

  markCooldown(key: string, explicitMs?: number): number {
    const state = this.states.find((s) => s.key === key);
    if (!state) return 0;

    state.failCount += 1;
    const backoff = Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** (state.failCount - 1));
    const jitter = Math.random() * 1000;
    const ms = explicitMs && explicitMs > 0 ? Math.max(explicitMs, 1000) : backoff + jitter;

    state.cooldownUntil = Date.now() + ms;
    return ms;
  }

  next(): string | null {
    if (this.states.length === 0) return null;
    const now = Date.now();
    for (let i = 0; i < this.states.length; i++) {
      const idx = (this.cursor + i) % this.states.length;
      const state = this.states[idx];
      if (state.cooldownUntil <= now) {
        this.cursor = (idx + 1) % this.states.length;
        return state.key;
      }
    }
    return null;
  }
}

export function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
