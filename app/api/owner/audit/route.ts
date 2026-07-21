import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { getAuditLogs } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const logs = await getAuditLogs(limit);
  return Response.json({ logs, total: logs.length }, { headers: secureHeaders() });
}
