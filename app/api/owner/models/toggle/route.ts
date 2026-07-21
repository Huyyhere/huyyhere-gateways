import { NextRequest, NextResponse } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { toggleModel, getEnabledModels } from "@/lib/provider-keys";

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => null);
  if (!body || !body.provider || !body.modelId || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "provider, modelId, enabled required" }, { status: 400, headers: secureHeaders() });
  }

  const ok = await toggleModel(body.provider, body.modelId, body.enabled);
  if (!ok) {
    return NextResponse.json({ error: "no active key for provider" }, { status: 400, headers: secureHeaders() });
  }

  const enabled = getEnabledModels();
  return NextResponse.json({ success: true, enabledModels: enabled }, { headers: secureHeaders() });
}

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const enabled = getEnabledModels();
  return NextResponse.json({ enabledModels: enabled }, { headers: secureHeaders() });
}
