import { NextRequest, NextResponse } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import {
  listProviderKeys,
  addProviderKey,
  batchAddProviderKeys,
  deleteProviderKey,
  getStats,
} from "@/lib/provider-keys";
import { PROVIDER_REGISTRY } from "@/lib/provider-registry";

function mask(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 3)}...`;
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const keys = await listProviderKeys();
  const providers = Object.entries(PROVIDER_REGISTRY).map(([name, cfg]) => ({
    name,
    signup: cfg.signup,
    noKey: !!cfg.noKey,
    wired: !!cfg.envPrefix,
  }));

  return NextResponse.json(
    {
      keys: keys.map((k) => ({ ...k, apiKey: mask(k.apiKey) })),
      stats: getStats(),
      providers,
    },
    { headers: secureHeaders() }
  );
}

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));
  const provider = String(body.provider || "");
  if (!PROVIDER_REGISTRY[provider]) {
    return NextResponse.json({ error: `unknown provider: ${provider}` }, { status: 400, headers: secureHeaders() });
  }

  if (typeof body.keysText === "string") {
    const { added, total } = await batchAddProviderKeys(provider, body.keysText);
    return NextResponse.json({ added, total }, { headers: secureHeaders() });
  }

  const apiKey = String(body.apiKey || "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey required" }, { status: 400, headers: secureHeaders() });
  }
  const key = await addProviderKey(provider, apiKey);
  if (!key) {
    return NextResponse.json({ error: "duplicate key" }, { status: 409, headers: secureHeaders() });
  }
  return NextResponse.json({ key: { ...key, apiKey: mask(key.apiKey) } }, { headers: secureHeaders() });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400, headers: secureHeaders() });

  const ok = await deleteProviderKey(id);
  return NextResponse.json({ deleted: ok }, { headers: secureHeaders() });
}
