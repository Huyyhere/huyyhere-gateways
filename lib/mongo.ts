import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "huyyhere_gateway";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  if (!MONGODB_URI) throw new Error("MONGODB_URI not configured");

  client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });

  await client.connect();
  db = client.db(DB_NAME);

  await db.collection("requests").createIndex({ timestamp: -1 });
  await db.collection("requests").createIndex({ model: 1 });
  await db.collection("requests").createIndex({ status: 1 });
  await db.collection("requests").createIndex({ requestId: 1 }, { unique: true });

  return db;
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
