import { ProviderName } from "./config";
import { getCollection, hasMongoUri } from "./mongodb";

interface KeyStoreDocument {
  _id: ProviderName;
  keys: string[];
  updatedAt: Date;
}

export async function saveProviderKeys(provider: ProviderName, keys: string[]) {
  if (!hasMongoUri()) return;
  try {
    const col = await getCollection<KeyStoreDocument>("provider_keys");
    await col.updateOne(
      { _id: provider },
      { $set: { keys, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`[keystore] failed to save ${provider} keys:`, (err as Error).message);
  }
}

export async function loadProviderKeys(provider: ProviderName): Promise<string[] | null> {
  if (!hasMongoUri()) return null;
  try {
    const col = await getCollection<KeyStoreDocument>("provider_keys");
    const doc = await col.findOne({ _id: provider });
    return doc?.keys ?? null;
  } catch {
    return null;
  }
}
