import { getDb } from "./mongo";

export interface RequestLog {
  requestId: string;
  timestamp: string;
  model: string;
  status: "success" | "error" | "cached" | "fallback";
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  tools: string[];
  error?: string;
  cached?: boolean;
}

interface ModelStats {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  errors: number;
  avgLatencyMs: number;
  lastUsed: string;
}

interface HourlyStats {
  hour: string;
  requests: number;
  tokens: number;
  cost: number;
}

const recentLogs: RequestLog[] = [];
const MAX_LOGS = 10_000;
const MAX_HOURS = 48;
const modelStats = new Map<string, ModelStats>();
const hourlyStats = new Map<string, HourlyStats>();

function getHourKey(ts: string) {
  return ts.slice(0, 13);
}

function cleanupHourlyStats() {
  const cutoff = new Date(Date.now() - MAX_HOURS * 3600_000).toISOString().slice(0, 13);
  for (const [key] of hourlyStats) {
    if (key < cutoff) hourlyStats.delete(key);
  }
}

let mongoReady = false;

async function ensureMongo() {
  if (mongoReady) return;
  try {
    await getDb();
    mongoReady = true;
  } catch {
    // MongoDB not available, continue with in-memory only
  }
}

export async function trackRequest(log: RequestLog) {
  recentLogs.push(log);
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();

  const ms = modelStats.get(log.model) || {
    requests: 0, tokensIn: 0, tokensOut: 0, cost: 0, errors: 0, avgLatencyMs: 0, lastUsed: log.timestamp,
  };
  ms.requests++;
  ms.tokensIn += log.tokensIn;
  ms.tokensOut += log.tokensOut;
  ms.cost += log.cost;
  if (log.status === "error") ms.errors++;
  ms.avgLatencyMs = (ms.avgLatencyMs * (ms.requests - 1) + log.latencyMs) / ms.requests;
  ms.lastUsed = log.timestamp;
  modelStats.set(log.model, ms);

  const hk = getHourKey(log.timestamp);
  const hs = hourlyStats.get(hk) || { hour: hk, requests: 0, tokens: 0, cost: 0 };
  hs.requests++;
  hs.tokens += log.tokensIn + log.tokensOut;
  hs.cost += log.cost;
  hourlyStats.set(hk, hs);

  cleanupHourlyStats();

  ensureMongo().then(async () => {
    try {
      const db = await getDb();
      await db.collection("requests").insertOne({
        ...log,
        createdAt: new Date(),
      });
    } catch {}
  });
}

export function getAnalytics() {
  const models: Record<string, ModelStats> = {};
  let totalRequests = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;
  let totalErrors = 0;

  for (const [model, stats] of modelStats) {
    models[model] = stats;
    totalRequests += stats.requests;
    totalTokensIn += stats.tokensIn;
    totalTokensOut += stats.tokensOut;
    totalCost += stats.cost;
    totalErrors += stats.errors;
  }

  const hours = Array.from(hourlyStats.values()).sort((a, b) => a.hour.localeCompare(b.hour));

  return {
    summary: {
      totalRequests,
      totalTokensIn,
      totalTokensOut,
      totalCost: `$${totalCost.toFixed(6)}`,
      totalErrors,
      errorRate: totalRequests > 0 ? `${((totalErrors / totalRequests) * 100).toFixed(1)}%` : "0%",
      uptime: process.uptime().toFixed(0) + "s",
    },
    models,
    hourly: hours.slice(-24),
    recentErrors: recentLogs.filter((l) => l.status === "error").slice(-20),
  };
}

export function getRecentLogs(limit = 100, model?: string) {
  let logs = recentLogs;
  if (model) logs = logs.filter((l) => l.model === model);
  return logs.slice(-limit);
}

export async function getMongoAnalytics(hours = 24) {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - hours * 3600_000);

    const byModel = await db.collection("requests").aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: "$model",
        requests: { $sum: 1 },
        tokensIn: { $sum: "$tokensIn" },
        tokensOut: { $sum: "$tokensOut" },
        cost: { $sum: "$cost" },
        errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
        avgLatency: { $avg: "$latencyMs" },
      }},
      { $sort: { requests: -1 } },
    ]).toArray();

    const byHour = await db.collection("requests").aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%dT%H:00:00", date: "$createdAt" } },
        requests: { $sum: 1 },
        tokens: { $sum: { $add: ["$tokensIn", "$tokensOut"] } },
        cost: { $sum: "$cost" },
      }},
      { $sort: { _id: 1 } },
    ]).toArray();

    const total = await db.collection("requests").countDocuments({ createdAt: { $gte: since } });
    const errors = await db.collection("requests").countDocuments({ createdAt: { $gte: since }, status: "error" });

    return {
      totalRequests: total,
      totalErrors: errors,
      errorRate: total > 0 ? `${((errors / total) * 100).toFixed(1)}%` : "0%",
      byModel: byModel.map((d: Record<string, unknown>) => ({
        model: d._id,
        requests: d.requests,
        tokensIn: d.tokensIn,
        tokensOut: d.tokensOut,
        cost: `$${(d.cost as number).toFixed(6)}`,
        errors: d.errors,
        avgLatency: `${(d.avgLatency as number).toFixed(0)}ms`,
      })),
      byHour: byHour.map((d: Record<string, unknown>) => ({
        hour: d._id,
        requests: d.requests,
        tokens: d.tokens,
        cost: `$${(d.cost as number).toFixed(6)}`,
      })),
    };
  } catch {
    return null;
  }
}

export function clearAnalytics() {
  recentLogs.length = 0;
  modelStats.clear();
  hourlyStats.clear();
}
