import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders, sanitize, validateName } from "@/lib/owner-security";
import { createWebhook, listWebhooks, deleteWebhook, toggleWebhook } from "@/lib/webhooks";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const hooks = await listWebhooks();
  return Response.json({ webhooks: hooks }, { headers: secureHeaders() });
}

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));
  const name = sanitize(body.name || "");
  const url = sanitize(body.url || "");
  const type = body.type || "custom";
  const events = Array.isArray(body.events) ? body.events : [];

  if (!name || !url) {
    return Response.json({ error: "name and url required" }, { status: 400, headers: secureHeaders() });
  }

  if (!validateName(name)) {
    return Response.json({ error: "invalid name (alphanumeric, dashes, underscores only)" }, { status: 400, headers: secureHeaders() });
  }

  if (!["telegram", "discord", "slack", "custom"].includes(type)) {
    return Response.json({ error: "invalid type" }, { status: 400, headers: secureHeaders() });
  }

  const webhook = await createWebhook(name, url, type, events);
  await auditLog("webhook_create", `${name} (${type})`);

  return Response.json({ webhook }, { headers: secureHeaders() });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400, headers: secureHeaders() });

  await deleteWebhook(id);
  await auditLog("webhook_delete", id);

  return Response.json({ ok: true }, { headers: secureHeaders() });
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));
  if (body.id && body.active !== undefined) {
    await toggleWebhook(body.id, body.active);
    await auditLog("webhook_toggle", `${body.id} → ${body.active}`);
  }

  return Response.json({ ok: true }, { headers: secureHeaders() });
}
