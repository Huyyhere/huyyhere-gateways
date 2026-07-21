import { NextRequest } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { buildModelRoutes } from "@/lib/provider";
import { getKeyPool, MODEL_IDS, MODEL_CAPABILITIES } from "@/lib/models";

interface ProviderInfo {
  name: string;
  baseUrl: string;
  keyCount: number;
  models: string[];
  status: "configured" | "no-keys";
}

export async function GET(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const routes = buildModelRoutes();
  const providers: Record<string, ProviderInfo> = {};

  const DISPLAY_NAMES: Record<string, string> = {
    blackcat: "BlackCat",
    zlkpro: "ZLKPro",
    venuses: "Venuses",
    zai: "Z.AI",
  };
  const ENV_PREFIXES: Record<string, string> = {
    blackcat: "BLACKCAT",
    zlkpro: "ZLKPRO",
    venuses: "VENESES",
    zai: "ZAI",
  };

  for (const [modelId, route] of Object.entries(routes)) {
    const providerName = DISPLAY_NAMES[route.provider] || route.provider;

    if (!providers[providerName]) {
      const prefix = ENV_PREFIXES[route.provider] || "";

      providers[providerName] = {
        name: providerName,
        baseUrl: route.baseUrl,
        keyCount: prefix ? getKeyPool(prefix).length : 0,
        models: [],
        status: prefix && getKeyPool(prefix).length > 0 ? "configured" : "no-keys",
      };
    }
    providers[providerName].models.push(modelId);
  }

  return Response.json({ providers: Object.values(providers) }, { headers: secureHeaders() });
}
