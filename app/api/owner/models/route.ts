import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { MODEL_IDS, MODEL_CAPABILITIES } from "@/lib/models";
import { buildModelRoutes } from "@/lib/provider";

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const routes = buildModelRoutes();
  const models = MODEL_IDS.map((id) => ({
    id,
    available: id in routes,
    hasKey: id in routes ? !!routes[id].getApiKey() : false,
    capabilities: MODEL_CAPABILITIES[id],
    route: routes[id] ? { baseUrl: routes[id].baseUrl, upstreamModel: routes[id].model, provider: routes[id].provider } : null,
  }));

  return Response.json({ models, total: models.length }, { headers: secureHeaders() });
}
