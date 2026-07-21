import { NextRequest, NextResponse } from "next/server";
import { getKey } from "./api-keys";
import { isOwnerSecret } from "./owner-security";

export async function validateApiKey(req: NextRequest): Promise<{ valid: boolean; key?: string; error?: NextResponse }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";

  if (!token) {
    return { valid: false, error: NextResponse.json({ error: "missing api key", type: "authentication_error" }, { status: 401 }) };
  }

  // Owner bypass (timing-safe, no hardcoded fallback secret)
  if (isOwnerSecret(token)) return { valid: true, key: token };

  const apiKey = await getKey(token);
  if (!apiKey) {
    return { valid: false, error: NextResponse.json({ error: "invalid api key", type: "authentication_error" }, { status: 401 }) };
  }
  if (!apiKey.active) {
    return { valid: false, error: NextResponse.json({ error: "api key is disabled", type: "authentication_error" }, { status: 403 }) };
  }
  if (apiKey.tokenLimit > 0 && apiKey.tokensUsed >= apiKey.tokenLimit) {
    return { valid: false, error: NextResponse.json(
      { error: "token quota exceeded", type: "quota_error", limit: apiKey.tokenLimit, used: apiKey.tokensUsed },
      { status: 429 }
    ) };
  }
  if (apiKey.dailyLimit && (apiKey.dailyUsed || 0) >= apiKey.dailyLimit) {
    return { valid: false, error: NextResponse.json(
      { error: "daily free quota exceeded, resets at 00:00 UTC", type: "quota_error", limit: apiKey.dailyLimit, used: apiKey.dailyUsed },
      { status: 429 }
    ) };
  }

  return { valid: true, key: token };
}
