import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { buildModelRoutes } from "@/lib/provider";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const routes = buildModelRoutes();
  const models = Object.keys(routes).map((id) => ({
    id,
    available: true,
    hasKey: !!routes[id].getApiKey(),
    route: { baseUrl: routes[id].baseUrl, upstreamModel: routes[id].model, provider: routes[id].provider },
  }));

  return Response.json({ models, total: models.length }, { headers: secureHeaders() });
}
