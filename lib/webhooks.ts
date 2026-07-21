import { getDb } from "./mongo";

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  type: "telegram" | "discord" | "slack" | "custom";
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface Notification {
  event: string;
  title: string;
  message: string;
  timestamp: string;
  severity: "info" | "warning" | "error" | "critical";
}

const webhooks = new Map<string, WebhookConfig>();
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  try {
    const db = await getDb();
    const docs = await db.collection("webhooks").find({}).toArray();
    for (const doc of docs) {
      const w = doc as unknown as WebhookConfig;
      webhooks.set(w.id, w);
    }
  } catch {}
  loaded = true;
}

async function saveWebhook(w: WebhookConfig) {
  try {
    const db = await getDb();
    await db.collection("webhooks").updateOne({ id: w.id }, { $set: w }, { upsert: true });
  } catch {}
}

export async function createWebhook(name: string, url: string, type: WebhookConfig["type"], events: string[]): Promise<WebhookConfig> {
  await ensureLoaded();
  const w: WebhookConfig = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, url, type, events,
    active: true,
    createdAt: new Date().toISOString(),
  };
  webhooks.set(w.id, w);
  await saveWebhook(w);
  return w;
}

export async function listWebhooks(): Promise<WebhookConfig[]> {
  await ensureLoaded();
  return Array.from(webhooks.values());
}

export async function deleteWebhook(id: string): Promise<boolean> {
  await ensureLoaded();
  if (webhooks.delete(id)) {
    try {
      const db = await getDb();
      await db.collection("webhooks").deleteOne({ id });
    } catch {}
    return true;
  }
  return false;
}

export async function toggleWebhook(id: string, active: boolean): Promise<boolean> {
  await ensureLoaded();
  const w = webhooks.get(id);
  if (!w) return false;
  w.active = active;
  await saveWebhook(w);
  return true;
}

async function sendTelegram(url: string, text: string) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, parse_mode: "HTML" }),
  });
}

async function sendDiscord(url: string, title: string, message: string, color: number) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{ title, description: message, color, timestamp: new Date().toISOString() }],
    }),
  });
}

async function sendCustom(url: string, payload: Record<string, unknown>) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function notify(notification: Notification) {
  await ensureLoaded();
  const severityColors: Record<string, number> = {
    info: 0x3498db, warning: 0xf39c12, error: 0xe74c3c, critical: 0x8e44ad,
  };

  for (const w of webhooks.values()) {
    if (!w.active) continue;
    if (w.events.length > 0 && !w.events.includes(notification.event)) continue;

    try {
      const color = severityColors[notification.severity] || 0x3498db;

      if (w.type === "telegram") {
        const html = `<b>${notification.title}</b>\n\n${notification.message}\n\n<i>${notification.timestamp}</i>`;
        await sendTelegram(w.url, html);
      } else if (w.type === "discord") {
        await sendDiscord(w.url, notification.title, notification.message, color);
      } else {
        await sendCustom(w.url, notification as unknown as Record<string, unknown>);
      }
    } catch {}
  }
}

// Convenience functions
export async function notifyError(model: string, error: string) {
  await notify({
    event: "error",
    title: "Model Error",
    message: `Model: ${model}\nError: ${error}`,
    timestamp: new Date().toISOString(),
    severity: "error",
  });
}

export async function notifyBreakerOpen(model: string) {
  await notify({
    event: "breaker_open",
    title: "Circuit Breaker Opened",
    message: `Circuit breaker opened for ${model}`,
    timestamp: new Date().toISOString(),
    severity: "warning",
  });
}

export async function notifyQuotaExceeded(keyName: string) {
  await notify({
    event: "quota_exceeded",
    title: "API Key Quota Exceeded",
    message: `Key "${keyName}" has exceeded its token quota`,
    timestamp: new Date().toISOString(),
    severity: "warning",
  });
}

export async function notifySystem(event: string, title: string, message: string) {
  await notify({
    event,
    title,
    message,
    timestamp: new Date().toISOString(),
    severity: "info",
  });
}
