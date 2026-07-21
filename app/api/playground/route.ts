import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/user-security";
import { getOrCreateUserKey, recordUsageByDiscordId } from "@/lib/api-keys";
import { POST as chatCompletionsHandler } from "@/app/api/chat/route";

const OWNER_SECRET = process.env.OWNER_SECRET!;

export async function POST(req: NextRequest) {
  const auth = await verifyUserAuth(req);
  if (!auth.allowed) return auth.error!;
  const session = auth.session!;

  const userKey = await getOrCreateUserKey(session.id, session.username);
  if (userKey.dailyLimit && (userKey.dailyUsed || 0) >= userKey.dailyLimit) {
    return NextResponse.json(
      { error: "daily free quota exceeded, resets at 00:00 UTC" },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const model = String(body.model || "auto").slice(0, 100);
  const message = String(body.message || "").slice(0, 8000);
  const stream = Boolean(body.stream);
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Self-calls the gateway's own handler using the owner secret so we never
  // need to hold the user's raw (hashed, unrecoverable) key server-side.
  // Quota is enforced above and usage is recorded against the user's own
  // key afterward, so their daily allowance still applies correctly.
  const innerReq = new NextRequest(new URL("/v1/chat/completions", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OWNER_SECRET}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: message }], stream }),
  });

  const res = await chatCompletionsHandler(innerReq);

  if (stream) {
    // Best-effort: precise token accounting isn't available on the streamed
    // passthrough without buffering the whole response server-side, so we
    // charge a rough estimate once the stream completes.
    const [clientStream, meterStream] = res.body!.tee();
    meterAndRecord(meterStream, session.id, message);
    return new NextResponse(clientStream, {
      status: res.status,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const data = await res.json().catch(() => ({}));
  const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  if (usage) {
    await recordUsageByDiscordId(session.id, usage.prompt_tokens || 0, usage.completion_tokens || 0);
  }
  return NextResponse.json(data, { status: res.status });
}

async function meterAndRecord(stream: ReadableStream<Uint8Array>, discordId: string, promptText: string) {
  try {
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let chars = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chars += dec.decode(value).length;
    }
    // ~4 chars/token rough estimate for the free-text passthrough.
    const estOut = Math.ceil(chars / 4);
    const estIn = Math.ceil(promptText.length / 4);
    await recordUsageByDiscordId(discordId, estIn, estOut);
  } catch {
    // best-effort only
  }
}
