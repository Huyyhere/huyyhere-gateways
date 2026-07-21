import { registerTool, Tool } from "../tools/registry";

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
  status: "connected" | "disconnected" | "error";
  tools: string[];
  error?: string;
}

const servers = new Map<string, MCPServer>();

export function listServers(): MCPServer[] {
  return Array.from(servers.values());
}

export function getServer(id: string): MCPServer | undefined {
  return servers.get(id);
}

async function jsonRpc(
  url: string,
  method: string,
  params: Record<string, unknown> = {},
  apiKey?: string
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          return JSON.parse(line.slice(6));
        } catch {}
      }
    }
    throw new Error("No valid SSE data");
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result || data;
}

export async function connectServer(
  id: string,
  name: string,
  url: string,
  apiKey?: string
): Promise<MCPServer> {
  try {
    const initResult = (await jsonRpc(url, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "huyyhere-gateway", version: "0.1.8" },
    }, apiKey)) as Record<string, unknown>;

    try {
      await jsonRpc(url, "notifications/initialized", {}, apiKey);
    } catch {}

    const toolsResult = (await jsonRpc(url, "tools/list", {}, apiKey)) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>;
    };

    const mcpTools: Tool[] = (toolsResult.tools || []).map((t) => ({
      name: `${id}__${t.name}`,
      description: `[${name}] ${t.description}`,
      parameters: t.inputSchema || { type: "object", properties: {} },
      execute: async (args: Record<string, unknown>) => {
        const res = (await jsonRpc(url, "tools/call", {
          name: t.name,
          arguments: args,
        }, apiKey)) as Record<string, unknown>;

        const content = res.content as Array<{ type: string; text?: string }> | undefined;
        if (content?.length) {
          return content.map((c) => c.text || "").join("\n");
        }
        return JSON.stringify(res);
      },
    }));

    for (const tool of mcpTools) {
      registerTool(tool);
    }

    const server: MCPServer = {
      id,
      name,
      url,
      apiKey,
      status: "connected",
      tools: mcpTools.map((t) => t.name),
    };

    servers.set(id, server);
    return server;
  } catch (e) {
    const server: MCPServer = {
      id,
      name,
      url,
      apiKey,
      status: "error",
      tools: [],
      error: e instanceof Error ? e.message : "Unknown error",
    };
    servers.set(id, server);
    throw e;
  }
}

export function disconnectServer(id: string): boolean {
  const server = servers.get(id);
  if (!server) return false;
  servers.delete(id);
  return true;
}

export function getConnectedToolCount(): number {
  let count = 0;
  for (const server of servers.values()) {
    if (server.status === "connected") {
      count += server.tools.length;
    }
  }
  return count;
}
