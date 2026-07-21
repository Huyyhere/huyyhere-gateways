"use client";

import { useEffect, useState, useRef } from "react";
import "./globals.css";

const BASE = "https://huyyhere-gateways.vercel.app";
const MODELS = [
  "auto",
  "kimi-k2.7-code", "minimax-m3", "kimi-k2.6",
  "deepseek-v4-pro",
  "glm-5.2", "grok-4.5",
  "mimo-code-free", "glm-4.7-flash", "glm-4.5-flash",
];

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
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
        <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: "var(--teal)", borderRadius: 2, minHeight: v > 0 ? 2 : 0, transition: "height 0.3s" }} title={`${v}`} />
      ))}
    </div>
  );
}

// The signature element: a patch-bay diagram. Several provider jacks route
// through the gateway trunk to a single output — this literally is what the
// gateway does, not a decorative flourish.
function PatchBay() {
  const sources = [
    { y: 26, label: "ZLKPro" },
    { y: 76, label: "Z.AI" },
    { y: 126, label: "Mistral" },
    { y: 176, label: "ElectronHub" },
    { y: 226, label: "+ 10 khác" },
  ];
  const gwX = 200, gwY = 126;

  return (
    <svg className="patchbay" viewBox="0 0 400 252" xmlns="http://www.w3.org/2000/svg">
      {sources.map((s, i) => (
        <g key={s.label}>
          <path className={i === 0 || i === 2 ? "cable-live" : "cable"} d={`M 46 ${s.y} C 120 ${s.y}, 130 ${gwY}, ${gwX - 34} ${gwY}`} />
          <circle className={`jack-ring ${i === 0 || i === 2 ? "on" : ""}`} cx="34" cy={s.y} r="9" />
          {(i === 0 || i === 2) && <circle className="jack-dot" cx="34" cy={s.y} r="3.5" />}
          <text className="jack-label" x="50" y={s.y + 3}>{s.label}</text>
        </g>
      ))}

      <path className="cable-out" d={`M ${gwX + 34} ${gwY} C 300 ${gwY}, 310 ${gwY}, 364 ${gwY}`} />

      <rect x={gwX - 34} y={gwY - 30} width="68" height="60" rx="10" fill="var(--brass)" />
      <text className="gw-label" x={gwX} y={gwY - 6} textAnchor="middle">GATE</text>
      <text className="gw-label" x={gwX} y={gwY + 12} textAnchor="middle">WAY</text>

      <circle className="jack-ring on" cx="378" cy={gwY} r="10" />
      <circle className="jack-dot" cx="378" cy={gwY} r="4" />
      <text className="app-label" x="378" y={gwY + 24} textAnchor="middle">app của bạn</text>
    </svg>
  );
}

export default function Home() {
  const [m, setM] = useState<Metrics | null>(null);
  const [live, setLive] = useState(false);
  const ref = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/metrics/stream");
    ref.current = es;
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => { try { setM(JSON.parse(e.data)); } catch {} };
    return () => es.close();
  }, []);

  return (
    <div className="layout">
      <nav className="nav">
        <div className="brand"><span className="jack" />huyyhere-gateway</div>
        <a className="signin-btn" href="/dashboard">Sign in →</a>
      </nav>

      <div className="hero">
        <div>
          <h1>Nhiều provider AI,<br /><em>một đầu cắm</em> duy nhất.</h1>
          <p className="lede">
            HuyyHere Gateway gom {MODELS.length - 1} model từ nhiều provider miễn phí lại thành một endpoint chuẩn OpenAI/Anthropic. Đổi provider, key chết, rate limit — code của bạn không cần biết.
          </p>
          <div className="cta-row">
            <a className="cta-primary" href="/dashboard">Lấy free key →</a>
            <span className="cta-note">2,000,000 token miễn phí / ngày</span>
          </div>
        </div>
        <PatchBay />
      </div>

      <div className="status-bar">
        <div className="status-item"><span className={`dot ${live ? "" : "offline"}`} />{live ? "Đang sống" : "Đang kết nối..."}</div>
        <div className="status-item">{MODELS.length} model</div>
        <div className="status-item">59 tools</div>
      </div>

      {m && (
        <>
          <div className="block">
            <div className="section-title">Stats</div>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-label">Requests</div><div className="stat-value">{fmt(m.summary.totalRequests)}</div></div>
              <div className="stat-card"><div className="stat-label">Tokens In</div><div className="stat-value">{fmt(m.summary.totalTokensIn)}</div></div>
              <div className="stat-card"><div className="stat-label">Tokens Out</div><div className="stat-value">{fmt(m.summary.totalTokensOut)}</div></div>
              <div className={`stat-card ${Number(m.summary.errorRate) > 0 ? "red" : ""}`}><div className="stat-label">Error</div><div className="stat-value">{m.summary.errorRate}</div></div>
              <div className="stat-card"><div className="stat-label">Uptime</div><div className="stat-value">{m.summary.uptime}</div></div>
            </div>
          </div>

          {m.hourly.length > 0 && (
            <div className="block">
              <div className="section-title">Requests (24h)</div>
              <div className="chart-box"><Bar data={m.hourly.map(h => h.requests)} /></div>
            </div>
          )}

          {Object.keys(m.models).length > 0 && (
            <div className="block">
              <div className="section-title">Models đang chạy</div>
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
            </div>
          )}

          {Object.keys(m.breakers).length > 0 && (
            <div className="block">
              <div className="section-title">Circuit Breakers</div>
              <div className="breakers">
                {Object.entries(m.breakers).map(([model, b]) => (
                  <div key={model} className="breaker"><div className="mono">{model}</div><div className={`state ${b.state}`}>{b.state}</div><div className="sub">Fails: {b.failCount}</div></div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="block">
        <div className="section-title">Model jacks</div>
        <div className="jacks-grid">{MODELS.map(id => <div className="jack-card" key={id}><span className="ring" /><span className="name">{id}</span></div>)}</div>
      </div>

      <div className="block">
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
      </div>

      <div className="block">
        <div className="section-title">OpenAI SDK</div>
        <div className="code-block"><div className="code-header"><span>python</span></div>
          <pre>{`from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key="sk-huyyhere-gw-***")
r = client.chat.completions.create(model="auto", messages=[{"role":"user","content":"Hello"}])
print(r.choices[0].message.content)`}</pre></div>
      </div>

      <div className="block">
        <div className="section-title">Anthropic SDK</div>
        <div className="code-block"><div className="code-header"><span>python</span></div>
          <pre>{`import anthropic

client = anthropic.Anthropic(base_url="${BASE}/v1", api_key="sk-huyyhere-gw-***")
m = client.messages.create(model="auto", max_tokens=1024, messages=[{"role":"user","content":"Hello"}])
print(m.content[0].text)`}</pre></div>
      </div>

      <div className="block">
        <div className="section-title">curl</div>
        <div className="code-block"><div className="code-header"><span>bash</span></div>
          <pre>{`curl -X POST ${BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-huyyhere-gw-***" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`}</pre></div>
      </div>

      <footer className="footer"><span>huyyhere-gateway</span><span>v0.1.8</span></footer>
    </div>
  );
}
