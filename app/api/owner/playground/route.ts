import { NextRequest, NextResponse } from "next/server";
import { verifyOwnerAuth, secureHeaders } from "@/lib/owner-security";
import { POST as chatCompletionsHandler } from "@/app/api/chat/route";

const OWNER_SECRET = process.env.OWNER_SECRET!;

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAuth(req);
  if (!auth.allowed) return auth.error!;

  const body = await req.json().catch(() => ({}));
  const model = String(body.model || "auto").slice(0, 100);
  const message = String(body.message || "").slice(0, 8000);
  const stream = Boolean(body.stream);

  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400, headers: secureHeaders() });
  }

  const innerReq = new NextRequest(new URL("/v1/chat/completions", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OWNER_SECRET}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: message }], stream }),
  });

  const res = await chatCompletionsHandler(innerReq);

  if (stream) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const data = await res.json().catch(() => ({ error: "invalid upstream response" }));
  return NextResponse.json(data, { status: res.status, headers: secureHeaders() });
}
