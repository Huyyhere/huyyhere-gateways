import { NextRequest, NextResponse } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { testAndRecord, testAllParallel } from "@/lib/provider-keys";

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));

  if (body.id) {
    const result = await testAndRecord(String(body.id));
    if (!result) {
      return NextResponse.json({ error: "key not found" }, { status: 404, headers: secureHeaders() });
    }
    return NextResponse.json(result, { headers: secureHeaders() });
  }

  const results = await testAllParallel();
  return NextResponse.json(
    { results, summary: { ok: results.filter((r) => r.ok).length, total: results.length } },
    { headers: secureHeaders() }
  );
}
