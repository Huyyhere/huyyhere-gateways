export interface LogEntry {
  timestamp: string;
  requestId: string;
  method?: string;
  path?: string;
  model?: string;
  status?: number;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  tools?: string[];
  error?: string;
}

let enabled = process.env.LOGGING !== "off";

export function setLogging(on: boolean) {
  enabled = on;
}

export function log(entry: LogEntry) {
  if (!enabled) return;
  try {
    console.log(JSON.stringify(entry));
  } catch {}
}
