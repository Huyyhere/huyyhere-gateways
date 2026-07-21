import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { getDb } from "@/lib/mongo";
import { auditLog } from "@/lib/audit";

const CRITICAL_COLLECTIONS = ["system.indexes", "system.users"];

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  try {
    const db = await getDb();
    const collections = await db.listCollections().toArray();
    const backup: Record<string, unknown[]> = {};

    for (const col of collections) {
      const docs = await db.collection(col.name).find({}).toArray();
      backup[col.name] = docs.map(d => {
        const { _id, ...rest } = d;
        return rest;
      });
    }

    await auditLog("backup_export", `${Object.keys(backup).length} collections`);

    return Response.json({
      version: "1.0",
      timestamp: new Date().toISOString(),
      collections: Object.keys(backup),
      data: backup,
    }, {
      headers: {
        ...secureHeaders(),
        "Content-Disposition": `attachment; filename="gateway-backup-${new Date().toISOString().slice(0,10)}.json"`,
      },
    });
  } catch (e) {
    return Response.json({ error: "backup failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500, headers: secureHeaders() });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => null);
  if (!body?.data || typeof body.data !== "object") {
    return Response.json({ error: "invalid backup format: missing data object" }, { status: 400, headers: secureHeaders() });
  }

  const force = body.force === true;

  try {
    const db = await getDb();
    let imported = 0;
    const skipped: string[] = [];

    for (const [collection, docs] of Object.entries(body.data)) {
      if (!Array.isArray(docs)) continue;
      if (CRITICAL_COLLECTIONS.includes(collection)) {
        skipped.push(collection);
        continue;
      }

      if (!force) {
        const existingCount = await db.collection(collection).countDocuments();
        if (existingCount > 0 && docs.length === 0) continue;
      }

      if (docs.length > 0) {
        await db.collection(collection).deleteMany({});
        await db.collection(collection).insertMany(docs as any[]);
        imported += docs.length;
      }
    }

    await auditLog("backup_import", `${imported} documents in ${Object.keys(body.data).length} collections${force ? " (force)" : ""}${skipped.length ? `, skipped: ${skipped.join(", ")}` : ""}`);

    return Response.json({ ok: true, imported, collections: Object.keys(body.data).length - skipped.length, skipped }, { headers: secureHeaders() });
  } catch (e) {
    return Response.json({ error: "restore failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500, headers: secureHeaders() });
  }
}
