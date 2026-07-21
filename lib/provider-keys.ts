import { getDb } from "./mongo";
import crypto from "crypto";
import { PROVIDER_REGISTRY } from "./provider-registry";

export interface ProviderKey {
  id: string;
  provider: string;
  apiKey: string;
  status: "active" | "error" | "untested";
  addedAt: string;
  lastTestedAt?: string;
  lastTestMsg?: string;
}

const store = new Map<string, ProviderKey>(); // id -> record
let loaded = false;
let mongoAvailable = false;

function genId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export async function ensureLoaded() {
  if (loaded) return;
  try {
    const db = await getDb();
    mongoAvailable = true;
    const docs = await db.collection("provider_keys").find({}).toArray();
    for (const doc of docs) {
      store.set(doc.id, {
        id: doc.id,
        provider: doc.provider,
        apiKey: doc.apiKey,
        status: doc.status || "untested",
        addedAt: doc.addedAt,
        lastTestedAt: doc.lastTestedAt,
        lastTestMsg: doc.lastTestMsg,
      });
    }
  } catch {}
  loaded = true;
}

// Fire-and-forget refresh, used at module load so getDynamicKeysSync has data
// available as soon as possible without every caller needing to await.
export function syncProviderKeys() {
  ensureLoaded().catch(() => {});
}
syncProviderKeys();

async function saveKey(k: ProviderKey) {
  if (!mongoAvailable) return;
  try {
    const db = await getDb();
    await db.collection("provider_keys").updateOne({ id: k.id }, { $set: k }, { upsert: true });
  } catch {}
}

export async function listProviderKeys(): Promise<ProviderKey[]> {
  await ensureLoaded();
  return Array.from(store.values()).sort((a, b) => a.provider.localeCompare(b.provider) || b.addedAt.localeCompare(a.addedAt));
}

export function isDuplicate(provider: string, apiKey: string): boolean {
  for (const k of store.values()) {
    if (k.provider === provider && k.apiKey === apiKey) return true;
  }
  return false;
}

export async function addProviderKey(provider: string, apiKey: string): Promise<ProviderKey | null> {
  await ensureLoaded();
  if (isDuplicate(provider, apiKey)) return null;
  const k: ProviderKey = {
    id: genId(),
    provider,
    apiKey,
    status: "untested",
    addedAt: new Date().toISOString(),
  };
  store.set(k.id, k);
  await saveKey(k);
  return k;
}

export async function batchAddProviderKeys(provider: string, keysText: string): Promise<{ added: number; total: number }> {
  await ensureLoaded();
  const keys = keysText.replace(/,/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
  let added = 0;
  for (const key of keys) {
    if (!isDuplicate(provider, key)) {
      const k: ProviderKey = { id: genId(), provider, apiKey: key, status: "untested", addedAt: new Date().toISOString() };
      store.set(k.id, k);
      saveKey(k).catch(() => {});
      added++;
    }
  }
  return { added, total: keys.length };
}

export async function deleteProviderKey(id: string): Promise<boolean> {
  await ensureLoaded();
  if (!store.has(id)) return false;
  store.delete(id);
  if (mongoAvailable) {
    try {
      const db = await getDb();
      await db.collection("provider_keys").deleteOne({ id });
    } catch {}
  }
  return true;
}

async function setKeyResult(id: string, ok: boolean, message: string) {
  const k = store.get(id);
  if (!k) return;
  k.status = ok ? "active" : "error";
  k.lastTestedAt = new Date().toISOString();
  k.lastTestMsg = message;
  await saveKey(k);
}

export async function testProviderKey(provider: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
  const config = PROVIDER_REGISTRY[provider];
  if (!config) return { ok: false, message: "unknown provider" };
  if (config.noKey) return { ok: true, message: "no key required" };

  if (config.imageGen) {
    try {
      const res = await fetch(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text_prompts: [{ text: "a red dot" }], width: 512, height: 512, samples: 1, steps: 10 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return { ok: true, message: "image generated ok" };
      const text = await res.text();
      return { ok: false, message: `${res.status}: ${text.slice(0, 80)}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.testModel,
        messages: [{ role: "user", content: "Say hi in 3 words" }],
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const content = data?.choices?.[0]?.message?.content ?? "N/A";
      return { ok: true, message: String(content).slice(0, 50) };
    }
    const text = await res.text();
    return { ok: false, message: `${res.status}: ${text.slice(0, 80)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function testAndRecord(id: string): Promise<{ ok: boolean; message: string } | null> {
  await ensureLoaded();
  const k = store.get(id);
  if (!k) return null;
  const result = await testProviderKey(k.provider, k.apiKey);
  await setKeyResult(id, result.ok, result.message);
  return result;
}

export async function testAllParallel(): Promise<{ id: string; provider: string; ok: boolean; message: string }[]> {
  await ensureLoaded();
  const all = Array.from(store.values());
  const results = await Promise.all(
    all.map(async (k) => {
      const r = await testProviderKey(k.provider, k.apiKey);
      await setKeyResult(k.id, r.ok, r.message);
      return { id: k.id, provider: k.provider, ok: r.ok, message: r.message };
    })
  );
  return results;
}

// Synchronous read for buildModelRoutes()/getKeyPool, which run inline per
// request. Backed by whatever the in-memory cache currently holds — freshly
// added keys become visible as soon as ensureLoaded() has run once per process.
export function getDynamicKeysSync(provider: string): string[] {
  const keys: string[] = [];
  for (const k of store.values()) {
    if (k.provider === provider && k.status !== "error") keys.push(k.apiKey);
  }
  return keys;
}

export function getStats(): Record<string, { total: number; active: number; error: number; untested: number }> {
  const stats: Record<string, { total: number; active: number; error: number; untested: number }> = {};
  for (const k of store.values()) {
    if (!stats[k.provider]) stats[k.provider] = { total: 0, active: 0, error: 0, untested: 0 };
    stats[k.provider].total++;
    stats[k.provider][k.status]++;
  }
  return stats;
}
