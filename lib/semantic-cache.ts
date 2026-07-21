interface SemanticEntry {
  scope: string;
  ngrams: Set<string>;
  response: string;
  model: string;
  tokens: number;
  timestamp: number;
  hits: number;
}

const store: SemanticEntry[] = [];
const MAX_ENTRIES = 500;
const SIMILARITY_THRESHOLD = 0.85;
const ENTRY_TTL = 300_000; // 5 min

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1);
}

function getNGrams(tokens: string[], n = 2): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.add(tokens.slice(i, i + n).join(" "));
  }
  if (grams.size === 0 && tokens.length > 0) {
    for (const t of tokens) grams.add(t);
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function cleanup() {
  const now = Date.now();
  for (let i = store.length - 1; i >= 0; i--) {
    if (now - store[i].timestamp > ENTRY_TTL) store.splice(i, 1);
  }
  if (store.length > MAX_ENTRIES) {
    store.sort((a, b) => a.hits - b.hits);
    store.splice(0, store.length - MAX_ENTRIES);
  }
}

// `scope` should be a per-caller identifier (API key, or "owner"/"anon") so cached
// responses are never shared between different callers.
export function semanticGet(scope: string, text: string): { response: string; model: string } | null {
  cleanup();
  const tokens = tokenize(text);
  if (tokens.length < 2) return null;
  const queryNGrams = getNGrams(tokens);

  let bestSim = 0;
  let bestEntry: SemanticEntry | null = null;

  for (const entry of store) {
    if (entry.scope !== scope) continue;
    const sim = jaccard(queryNGrams, entry.ngrams);
    if (sim > bestSim) {
      bestSim = sim;
      bestEntry = entry;
    }
  }

  if (bestSim >= SIMILARITY_THRESHOLD && bestEntry) {
    bestEntry.hits++;
    return { response: bestEntry.response, model: bestEntry.model };
  }
  return null;
}

export function semanticSet(scope: string, text: string, response: string, model: string, tokens: number) {
  const toks = tokenize(text);
  if (toks.length < 2) return;
  const ngrams = getNGrams(toks);
  store.push({ scope, ngrams, response, model, tokens, timestamp: Date.now(), hits: 0 });
  if (store.length > MAX_ENTRIES) {
    store.sort((a, b) => a.hits - b.hits);
    store.shift();
  }
}

export function semanticStats() {
  cleanup();
  return { entries: store.length, totalHits: store.reduce((s, e) => s + e.hits, 0) };
}
