import { getDb } from "./mongo";

export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  timestamp: string;
}

const logs: AuditEntry[] = [];
const MAX_LOGS = 500;

export async function auditLog(action: string, detail: string) {
  const entry: AuditEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    action,
    detail,
    timestamp: new Date().toISOString(),
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();

  try {
    const db = await getDb();
    await db.collection("audit").insertOne({ ...entry, createdAt: new Date() });
  } catch {}
}

export async function getAuditLogs(limit = 100): Promise<AuditEntry[]> {
  return logs.slice(-limit).reverse();
}
