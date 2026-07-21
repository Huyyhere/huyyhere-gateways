import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/user-security";
import { getOrCreateUserKey, deleteKey, getKeyByDiscordId } from "@/lib/api-keys";

export async function GET(req: NextRequest) {
  const auth = await verifyUserAuth(req);
  if (!auth.allowed) return auth.error!;
  const session = auth.session!;

  const key = await getOrCreateUserKey(session.id, session.username, session.email);
  const isNew = "key" in key;

  return NextResponse.json({
    discordId: session.id,
    username: session.username,
    email: session.email,
    isOwner: session.isOwner,
    key: {
      preview: key.preview,
      raw: isNew ? (key as { key: string }).key : undefined, // only present the moment the key is first created
      active: key.active,
      dailyLimit: key.dailyLimit || 0,
      dailyUsed: key.dailyUsed || 0,
      tokensUsed: key.tokensUsed,
      requestCount: key.requestCount,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = await verifyUserAuth(req);
  if (!auth.allowed) return auth.error!;
  const session = auth.session!;

  const body = await req.json().catch(() => ({}));
  if (body.action !== "regenerate") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const existing = await getKeyByDiscordId(session.id);
  if (existing) await deleteKey(existing.id);
  const key = await getOrCreateUserKey(session.id, session.username, session.email);

  return NextResponse.json({
    key: {
      preview: key.preview,
      raw: (key as { key: string }).key,
      dailyLimit: key.dailyLimit || 0,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
