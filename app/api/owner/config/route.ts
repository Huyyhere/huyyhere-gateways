import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { getDb } from "@/lib/mongo";
import { auditLog } from "@/lib/audit";

const DEFAULT_CONFIG = {
  rateLimit: { global: 60, perKey: 120 },
  cache: { enabled: true, maxEntries: 1000 },
  circuitBreaker: { cooldownBase: 10000, maxCooldown: 300000, threshold: 3 },
  autoModel: { preferCheap: false, maxRounds: 3 },
};

async function loadConfig() {
  try {
    const db = await getDb();
    const doc = await db.collection("config").findOne({ _id: "gateway" as any });
    return doc ? { ...DEFAULT_CONFIG, ...doc } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const config = await loadConfig();
  return Response.json({ config }, { headers: secureHeaders() });
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));
  const current = await loadConfig();
  const updated = { ...current, ...body };

  try {
    const db = await getDb();
    await db.collection("config").updateOne(
      { _id: "gateway" as any },
      { $set: updated },
      { upsert: true }
    );
  } catch {}

  await auditLog("config_update", JSON.stringify(body));
  return Response.json({ config: updated }, { headers: secureHeaders() });
}
