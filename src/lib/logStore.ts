export interface LogEntry {
  id: number;
  time: string;
  level: "info" | "warn" | "error" | "success";
  tag: string;
  message: string;
}

const MAX_ENTRIES = 300;

const globalForLogs = globalThis as unknown as {
  __aiGatewayLogs?: LogEntry[];
  __aiGatewayLogSeq?: number;
};

const store: LogEntry[] = globalForLogs.__aiGatewayLogs || (globalForLogs.__aiGatewayLogs = []);

function nextId(): number {
  globalForLogs.__aiGatewayLogSeq = (globalForLogs.__aiGatewayLogSeq ?? 0) + 1;
  return globalForLogs.__aiGatewayLogSeq;
}

export function pushLog(level: LogEntry["level"], tag: string, message: string) {
  store.push({ id: nextId(), time: new Date().toISOString(), level, tag, message });
  if (store.length > MAX_ENTRIES) store.splice(0, store.length - MAX_ENTRIES);
}

export function getLogs(sinceId = 0): LogEntry[] {
  return store.filter((e) => e.id > sinceId);
}
