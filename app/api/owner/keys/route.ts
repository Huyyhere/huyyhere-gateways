import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { listKeys, createKey, deleteKey, toggleKey, resetUsage } from "@/lib/api-keys";
import { validateName, validateTokenLimit, sanitize } from "@/lib/owner-security";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const keys = await listKeys();
  return Response.json({ keys, total: keys.length }, { headers: secureHeaders() });
}

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));
  const name = sanitize(body.name || "unnamed");
  const tokenLimit = body.tokenLimit || 1_000_000;

  if (!validateName(name)) {
    return Response.json({ error: "invalid name" }, { status: 400, headers: secureHeaders() });
  }
  if (!validateTokenLimit(tokenLimit)) {
    return Response.json({ error: "invalid token limit" }, { status: 400, headers: secureHeaders() });
  }

  const key = await createKey(name, tokenLimit);
  await auditLog("key_create", `${name} (limit: ${tokenLimit})`);

  return Response.json({ key }, { headers: secureHeaders() });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400, headers: secureHeaders() });

  const ok = await deleteKey(id);
  if (ok) await auditLog("key_delete", id);

  return Response.json({ ok }, { headers: secureHeaders() });
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400, headers: secureHeaders() });

  if (body.active !== undefined) {
    await toggleKey(id, body.active);
    await auditLog("key_toggle", `${id} → ${body.active}`);
  }
  if (body.resetUsage) {
    await resetUsage(id);
    await auditLog("key_reset", id);
  }

  return Response.json({ ok: true }, { headers: secureHeaders() });
}
