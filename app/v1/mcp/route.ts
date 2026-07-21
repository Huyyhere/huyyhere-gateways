import { NextRequest, NextResponse } from "next/server";
import { listServers, connectServer, disconnectServer } from "@/lib/mcp/client";

export async function GET() {
  return NextResponse.json({ object: "list", data: listServers() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, id, name, url, api_key } = body;

  if (action === "connect") {
    if (!id || !name || !url) {
      return NextResponse.json({ error: "id, name, url required" }, { status: 400 });
    }
    try {
      const server = await connectServer(id, name, url, api_key);
      return NextResponse.json(server);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "connect failed" },
        { status: 500 }
      );
    }
  }

  if (action === "disconnect") {
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const ok = disconnectServer(id);
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
