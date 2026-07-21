import { getDb } from "./mongo";
import crypto from "crypto";

export interface ApiKey {
  id: string;
  keyHash: string;
  preview: string;
  name: string;
  tokenLimit: number;
  tokensUsed: number;
  requestCount: number;
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
  dailyLimit?: number;
  dailyUsed?: number;
  dailyResetAt?: string;
}

export interface NewApiKey extends ApiKey {
  key: string;
}

const keysByHash = new Map<string, ApiKey>();
let loaded = false;
let mongoAvailable = false;

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function genKey(): string {
  return "sk-gw-" + crypto.randomBytes(24).toString("hex");
}

function genId(): string {
  return crypto.randomBytes(8).toString("hex");
}

function preview(rawKey: string): string {
  return `${rawKey.slice(0, 8)}...${rawKey.slice(-4)}`;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollDaily(k: ApiKey) {
  if (!k.dailyLimit) return;
  const today = todayUTC();
  if (k.dailyResetAt !== today) {
    k.dailyResetAt = today;
    k.dailyUsed = 0;
  }
}

export async function ensureLoaded() {
  if (loaded) return;
  try {
    const db = await getDb();
    mongoAvailable = true;
    const docs = await db.collection("api_keys").find({}).toArray();
    for (const doc of docs) {
      const k: ApiKey = {
        id: doc.id,
        keyHash: doc.keyHash,
        preview: doc.preview || "sk-gw-...????",
        name: doc.name,
        tokenLimit: doc.tokenLimit,
        tokensUsed: doc.tokensUsed || 0,
        requestCount: doc.requestCount || 0,
        active: doc.active !== false,
        createdAt: doc.createdAt,
        lastUsedAt: doc.lastUsedAt,
        dailyLimit: doc.dailyLimit,
        dailyUsed: doc.dailyUsed || 0,
        dailyResetAt: doc.dailyResetAt,
      };
      keysByHash.set(k.keyHash, k);
    }
  } catch {}
  loaded = true;
}

export function syncFromDb() {
  ensureLoaded().catch(() => {});
}

async function saveKey(k: ApiKey) {
  if (!mongoAvailable) return;
  try {
    const db = await getDb();
    await db.collection("api_keys").updateOne(
      { id: k.id },
      { $set: k },
      { upsert: true }
    );
  } catch {}
}

export async function createKey(name: string, tokenLimit: number): Promise<NewApiKey> {
  await ensureLoaded();
  const rawKey = genKey();
  const k: ApiKey = {
    id: genId(),
    keyHash: hashKey(rawKey),
    preview: preview(rawKey),
    name,
    tokenLimit,
    tokensUsed: 0,
    requestCount: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };
  keysByHash.set(k.keyHash, k);
  await saveKey(k);
  return { ...k, key: rawKey };
}

export async function listKeys(): Promise<ApiKey[]> {
  await ensureLoaded();
  return Array.from(keysByHash.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getKeySync(rawKey: string): ApiKey | undefined {
  return keysByHash.get(hashKey(rawKey));
}

export async function getKey(rawKey: string): Promise<ApiKey | undefined> {
  await ensureLoaded();
  const k = keysByHash.get(hashKey(rawKey));
  if (k) rollDaily(k);
  return k;
}

export async function deleteKey(id: string): Promise<boolean> {
  await ensureLoaded();
  for (const [hash, v] of keysByHash) {
    if (v.id === id) {
      keysByHash.delete(hash);
      if (mongoAvailable) {
        try {
          const db = await getDb();
          await db.collection("api_keys").deleteOne({ id });
        } catch {}
      }
      return true;
    }
  }
  return false;
}

export async function toggleKey(id: string, active: boolean): Promise<boolean> {
  await ensureLoaded();
  for (const [, v] of keysByHash) {
    if (v.id === id) {
      v.active = active;
      await saveKey(v);
      return true;
    }
  }
  return false;
}

export async function recordUsage(rawKey: string, tokensIn: number, tokensOut: number): Promise<void> {
  const k = keysByHash.get(hashKey(rawKey));
  if (!k) return;
  rollDaily(k);
  const total = tokensIn + tokensOut;
  k.tokensUsed += total;
  if (k.dailyLimit) k.dailyUsed = (k.dailyUsed || 0) + total;
  k.requestCount++;
  k.lastUsedAt = new Date().toISOString();
  saveKey(k).catch(() => {});
}

export async function resetUsage(id: string): Promise<boolean> {
  await ensureLoaded();
  for (const [, v] of keysByHash) {
    if (v.id === id) {
      v.tokensUsed = 0;
      v.requestCount = 0;
      v.dailyUsed = 0;
      await saveKey(v);
      return true;
    }
  }
  return false;
}
