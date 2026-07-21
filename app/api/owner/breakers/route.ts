import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { getBreakerStats, resetBreaker } from "@/lib/circuit-breaker";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  return Response.json({ breakers: getBreakerStats() }, { headers: secureHeaders() });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const model = new URL(req.url).searchParams.get("model");
  if (!model) return Response.json({ error: "model param required" }, { status: 400, headers: secureHeaders() });

  resetBreaker(model);
  await auditLog("breaker_reset", model);

  return Response.json({ ok: true, reset: model }, { headers: secureHeaders() });
}
