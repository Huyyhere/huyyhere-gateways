"use client";

import { useEffect, useState, useRef } from "react";
import "./globals.css";

const BASE = "https://huyyhere-gateways.vercel.app";

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtBytes(b: number) {
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(1) + " GB";
  if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
}

interface Metrics {
  summary: { totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalCost: string; totalErrors: number; errorRate: string; uptime: string };
  models: Record<string, { requests: number; tokensIn: number; tokensOut: number; errors: number; avgLatencyMs: number }>;
  cache: { entries: number; bytes: number };
  breakers: Record<string, { state: string; failCount: number }>;
  rateLimiter: { keys: number };
  hourly: { hour: string; requests: number }[];
}

function Bar({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 50 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: "#3b82f6", borderRadius: 2, minHeight: v > 0 ? 2 : 0, transition: "height 0.3s" }} title={`${v}`} />
      ))}
    </div>
  );
}

export default function Home() {
  const [m, setM] = useState<Metrics | null>(null);
  const [live, setLive] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const ref = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/metrics/stream");
    ref.current = es;
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => { try { setM(JSON.parse(e.data)); } catch {} };
    return () => es.close();
  }, []);

  useEffect(() => {
    fetch("/v1/models").then(r => r.json()).then(d => {
      setModels(["auto", ...(d.data || []).map((m: { id: string }) => m.id)]);
    }).catch(() => setModels(["auto"]));
  }, []);

  return (
    <div className="layout">
      <div className="header-top">
        <header className="header">
          <h1><span className="brand-dot" />HuyyHere Gateways</h1>
          <p>AI API Gateway — OpenAI, Anthropic &amp; Responses API compatible</p>
          <p style={{ color: "var(--accent)", fontWeight: 600, marginTop: "0.35rem" }}>✦ Free 2,000,000 tokens / day per account</p>
        </header>
        <a className="signin-btn" href="/dashboard">Sign in →</a>
      </div>

      <div className="status-bar">
        <div className="status-item"><span className={`dot ${live ? "" : "offline"}`} /><span>{live ? "Live" : "Connecting..."}</span></div>
        <div className="status-item"><span style={{ color: "var(--text)" }}>{models.length}</span> models</div>
        <div className="status-item"><span style={{ color: "var(--text)" }}>59</span> tools</div>
      </div>

      {m && (
        <>
          <div className="section-title">Stats</div>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Requests</div><div className="stat-value">{fmt(m.summary.totalRequests)}</div></div>
            <div className="stat-card"><div className="stat-label">Tokens In</div><div className="stat-value">{fmt(m.summary.totalTokensIn)}</div></div>
            <div className="stat-card"><div className="stat-label">Tokens Out</div><div className="stat-value">{fmt(m.summary.totalTokensOut)}</div></div>
            <div className={`stat-card ${Number(m.summary.errorRate) > 0 ? "red" : ""}`}><div className="stat-label">Error</div><div className="stat-value">{m.summary.errorRate}</div></div>
            <div className="stat-card"><div className="stat-label">Uptime</div><div className="stat-value">{m.summary.uptime}</div></div>
          </div>

          {m.hourly.length > 0 && (
            <>
              <div className="section-title">Requests (24h)</div>
              <div className="chart-box"><Bar data={m.hourly.map(h => h.requests)} /></div>
            </>
          )}

          {Object.keys(m.models).length > 0 && (
            <>
              <div className="section-title">Models</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Model</th><th>Requests</th><th>Tokens In</th><th>Tokens Out</th><th>Errors</th><th>Latency</th></tr></thead>
                  <tbody>
                    {Object.entries(m.models).sort((a, b) => b[1].requests - a[1].requests).map(([model, s]) => (
                      <tr key={model}><td className="mono">{model}</td><td>{fmt(s.requests)}</td><td>{fmt(s.tokensIn)}</td><td>{fmt(s.tokensOut)}</td><td className={s.errors > 0 ? "err" : ""}>{s.errors}</td><td>{s.avgLatencyMs.toFixed(0)}ms</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {Object.keys(m.breakers).length > 0 && (
            <>
              <div className="section-title">Circuit Breakers</div>
              <div className="breakers">
                {Object.entries(m.breakers).map(([model, b]) => (
                  <div key={model} className={`breaker ${b.state}`}><div className="mono">{model}</div><div className={`state ${b.state}`}>{b.state}</div><div className="sub">Fails: {b.failCount}</div></div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="section-title">Models</div>
      <div className="models-grid">{models.map(m => <div className="model-card" key={m}><div className="name">{m}</div></div>)}</div>

      <div className="section-title">Endpoints</div>
      <div className="endpoints">
        <div className="endpoint"><span className="method post">POST</span><code>/v1/chat/completions</code><span className="desc">OpenAI-compatible</span></div>
        <div className="endpoint"><span className="method post">POST</span><code>/v1/messages</code><span className="desc">Anthropic Messages</span></div>
        <div className="endpoint"><span className="method post">POST</span><code>/v1/responses</code><span className="desc">OpenAI Responses</span></div>
        <div className="endpoint"><span className="method post">POST</span><code>/v1/embeddings</code><span className="desc">Embeddings</span></div>
        <div className="endpoint"><span className="method post">POST</span><code>/v1/images/generations</code><span className="desc">Image generation (Stability AI)</span></div>
        <div className="endpoint"><span className="method get">GET</span><code>/v1/models</code></div>
        <div className="endpoint"><span className="method get">GET</span><code>/v1/tools</code></div>
        <div className="endpoint"><span className="method get">GET</span><code>/api/health</code></div>
      </div>

      <div className="section-title">OpenAI SDK</div>
      <div className="code-block"><div className="code-header"><span>python</span></div>
        <pre>{`from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key="sk-huyyhere-gw-***")
r = client.chat.completions.create(model="auto", messages=[{"role":"user","content":"Hello"}])
print(r.choices[0].message.content)`}</pre></div>

      <div className="section-title">Anthropic SDK</div>
      <div className="code-block"><div className="code-header"><span>python</span></div>
        <pre>{`import anthropic

client = anthropic.Anthropic(base_url="${BASE}/v1", api_key="sk-huyyhere-gw-***")
m = client.messages.create(model="auto", max_tokens=1024, messages=[{"role":"user","content":"Hello"}])
print(m.content[0].text)`}</pre></div>

      <div className="section-title">curl</div>
      <div className="code-block"><div className="code-header"><span>bash</span></div>
        <pre>{`curl -X POST ${BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-huyyhere-gw-***" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`}</pre></div>

      <footer className="footer"><span>HuyyHere Gateways</span><span>v0.1.8</span></footer>
    </div>
  );
}
