import { MongoClient, type Collection, type Db, type Document } from "mongodb";

const uri = process.env.MONGODB_URI;

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (!uri) throw new Error("MONGODB_URI not set");
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("ai_gateway");
  return db;
}

export async function getCollection<T extends Document>(
  name: string
): Promise<Collection<T>> {
  const database = await getDb();
  return database.collection<T>(name);
}

export function hasMongoUri(): boolean {
  return !!uri;
}
