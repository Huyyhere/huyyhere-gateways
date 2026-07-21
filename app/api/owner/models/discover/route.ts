import { NextRequest, NextResponse } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { PROVIDER_REGISTRY, getProviderBaseUrl } from "@/lib/provider-registry";
import { listProviderKeys } from "@/lib/provider-keys";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400, headers: secureHeaders() });
  }

  const config = PROVIDER_REGISTRY[provider];
  if (!config) {
    return NextResponse.json({ error: "unknown provider" }, { status: 400, headers: secureHeaders() });
  }

  if (!config.supportsListModels) {
    return NextResponse.json({ error: "provider does not support model listing" }, { status: 400, headers: secureHeaders() });
  }

  // Get a key for this provider
  const keys = await listProviderKeys();
  const providerKey = keys.find((k) => k.provider === provider && k.status !== "error");
  if (!providerKey) {
    return NextResponse.json({ error: "no active key for provider" }, { status: 400, headers: secureHeaders() });
  }

  const baseUrl = getProviderBaseUrl(provider);
  if (!baseUrl) {
    return NextResponse.json({ error: "provider not configured" }, { status: 400, headers: secureHeaders() });
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${providerKey.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `API error: ${res.status}: ${text.slice(0, 100)}` }, { status: 502, headers: secureHeaders() });
    }

    const data = await res.json();
    // Most providers return { data: [{ id: "model-name", ... }] }
    const models = (data.data || data.models || []).map((m: { id: string; [key: string]: unknown }) => ({
      id: m.id,
      name: m.name || m.id,
    }));

    return NextResponse.json({ provider, models, total: models.length }, { headers: secureHeaders() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed to list models" }, { status: 502, headers: secureHeaders() });
  }
}
