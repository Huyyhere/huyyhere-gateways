import { ChatMessage, ChatRequest } from "./types";
import { ProviderName } from "./config";
import { getCollection, hasMongoUri } from "./mongodb";

const COLLECTION = "session_affinity";
const TTL_MS = 15 * 60_000;

interface AffinityDocument {
  _id: string;
  provider: ProviderName;
  updatedAt: Date;
}

const globalForAffinity = globalThis as unknown as {
  __aiGatewayAffinity?: Map<string, { provider: ProviderName; updatedAt: number }>;
};

const cache: Map<string, { provider: ProviderName; updatedAt: number }> =
  globalForAffinity.__aiGatewayAffinity || (globalForAffinity.__aiGatewayAffinity = new Map());

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function contentOf(message: ChatMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return "";
}

export function sessionKeyFor(req: ChatRequest): string {
  const system = req.messages.find((m) => m.role === "system");
  const firstUser = req.messages.find((m) => m.role === "user");
  return hash(contentOf(system).slice(0, 500) + "|" + contentOf(firstUser).slice(0, 200));
}

async function mongoGet(key: string): Promise<AffinityDocument | null> {
  try {
    const col = await getCollection<AffinityDocument>(COLLECTION);
    return col.findOne({ _id: key });
  } catch {
    return null;
  }
}

async function mongoSet(key: string, provider: ProviderName) {
  try {
    const col = await getCollection<AffinityDocument>(COLLECTION);
    await col.updateOne(
      { _id: key },
      { $set: { provider, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch {
    // fallback to cache-only
  }
}

export async function getStickyProvider(key: string): Promise<ProviderName | null> {
  const cached = cache.get(key);
  if (cached) {
    if (Date.now() - cached.updatedAt > TTL_MS) {
      cache.delete(key);
    } else {
      return cached.provider;
    }
  }

  if (!hasMongoUri()) return null;

  const doc = await mongoGet(key);
  if (!doc) return null;
  if (Date.now() - doc.updatedAt.getTime() > TTL_MS) return null;

  cache.set(key, { provider: doc.provider, updatedAt: doc.updatedAt.getTime() });
  return doc.provider;
}

export async function setStickyProvider(key: string, provider: ProviderName) {
  cache.set(key, { provider, updatedAt: Date.now() });

  if (!hasMongoUri()) return;
  await mongoSet(key, provider);
}
