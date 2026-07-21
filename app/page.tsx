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

interface Metrics {
  summary: { totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalCost: string; totalErrors: number; errorRate: string; uptime: string };
  models: Record<string, { requests: number; tokensIn: number; tokensOut: number; errors: number; avgLatencyMs: number }>;
  hourly: { hour: string; requests: number }[];
}

function Bar({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(v / max) * 100}%`,
            background: "linear-gradient(to top, var(--accent), var(--cyan))",
            borderRadius: 3,
            minHeight: v > 0 ? 3 : 0,
            transition: "height 0.3s ease",
            opacity: v > 0 ? 1 : 0.2,
          }}
          title={`${v} requests`}
        />
      ))}
    </div>
  );
}

function ArchDiagram() {
  const providers = [
    { y: 20, label: "Provider 1" },
    { y: 60, label: "Provider 2" },
    { y: 100, label: "Provider 3" },
    { y: 140, label: "Provider 4" },
    { y: 180, label: "+10 more" },
  ];
  const gwX = 240, gwY = 100;

  return (
    <svg viewBox="0 0 440 200" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id="gwGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="cableIn" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#505a7e" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="cableOut" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>

      {providers.map((s, i) => (
        <g key={s.label}>
          <path
            d={`M 50 ${s.y} C 130 ${s.y}, 150 ${gwY}, ${gwX - 38} ${gwY}`}
            fill="none"
            stroke={i < 3 ? "url(#cableIn)" : "#1e2548"}
            strokeWidth="2"
            strokeDasharray={i < 3 ? "6 7" : "4 6"}
            opacity={i < 3 ? 0.8 : 0.4}
          >
            {i < 3 && (
              <animate attributeName="stroke-dashoffset" from="0" to="-26" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
            )}
          </path>
          <circle cx="34" cy={s.y} r="8" fill="#111631" stroke={i < 3 ? "#3b82f6" : "#1e2548"} strokeWidth="1.5" />
          {i < 3 && <circle cx="34" cy={s.y} r="3" fill="#3b82f6" />}
          <text x="52" y={s.y + 3.5} fill="#505a7e" fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="0.02em">{s.label}</text>
        </g>
      ))}

      <path
        d={`M ${gwX + 38} ${gwY} C 340 ${gwY}, 350 ${gwY}, 396 ${gwY}`}
        fill="none"
        stroke="url(#cableOut)"
        strokeWidth="2.5"
        strokeDasharray="7 6"
      >
        <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="1.6s" repeatCount="indefinite" />
      </path>

      <rect x={gwX - 38} y={gwY - 32} width="76" height="64" rx="12" fill="url(#gwGrad)" opacity="0.95" />
      <text x={gwX} y={gwY - 5} textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="Space Grotesk, sans-serif">GATE</text>
      <text x={gwX} y={gwY + 13} textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="Space Grotesk, sans-serif">WAY</text>

      <circle cx="410" cy={gwY} r="10" fill="#111631" stroke="#10b981" strokeWidth="2" />
      <circle cx="410" cy={gwY} r="4" fill="#10b981" />
      <text x="410" y={gwY + 24} textAnchor="middle" fill="#8b93b3" fontSize="9" fontFamily="JetBrains Mono, monospace">your app</text>
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`copy-btn ${copied ? "copied" : ""}`}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
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
    <div className="container">
      <nav className="nav">
        <div className="brand">
          <div className="brand-icon">H</div>
          huyyhere
        </div>
        <div className="nav-links">
          <a href="#endpoints">API</a>
          <a href="#docs">Docs</a>
          <a className="btn-sm" href="/dashboard">Dashboard</a>
        </div>
      </nav>

      <div className="hero">
        <div>
          <h1>
            One endpoint.<br />
            <span className="gradient-text">One model. Auto-failover.</span>
          </h1>
          <p className="subtitle">
            HuyyHere Gateway routes your requests across 10+ free AI providers.
            Provider down? Key expired? Rate limited? Your code never knows.
          </p>
          <div className="cta-row">
            <a className="btn-primary" href="/dashboard">
              Get started
              <span style={{ fontSize: "1.1em" }}>→</span>
            </a>
            <a className="btn-secondary" href="#docs">View docs</a>
          </div>
        </div>
        <div className="arch-diagram">
          <ArchDiagram />
        </div>
      </div>

      <div className="glass status-bar">
        <div className="status-item">
          <span className={`status-dot ${live ? "" : "offline"}`} />
          {live ? "Live" : "Connecting..."}
        </div>
        <div className="status-item">model: auto</div>
        <div className="status-item">28 tools</div>
        <div className="status-item">OpenAI compatible</div>
      </div>

      {m && (
        <>
          <div className="section">
            <div className="section-label">Stats</div>
            <div className="stats-grid">
              <div className="glass stat-card">
                <div className="stat-label">Requests</div>
                <div className="stat-value">{fmt(m.summary.totalRequests)}</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-label">Tokens In</div>
                <div className="stat-value">{fmt(m.summary.totalTokensIn)}</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-label">Tokens Out</div>
                <div className="stat-value">{fmt(m.summary.totalTokensOut)}</div>
              </div>
              <div className={`glass stat-card ${Number(m.summary.errorRate) > 0 ? "err" : ""}`}>
                <div className="stat-label">Error Rate</div>
                <div className="stat-value">{m.summary.errorRate}</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-label">Uptime</div>
                <div className="stat-value">{m.summary.uptime}</div>
              </div>
            </div>
          </div>

          {m.hourly.length > 0 && (
            <div className="section">
              <div className="section-label">Requests (24h)</div>
              <div className="glass chart-box">
                <Bar data={m.hourly.map(h => h.requests)} />
              </div>
            </div>
          )}

          {Object.keys(m.models).length > 0 && (
            <div className="section">
              <div className="section-label">Active Models</div>
              <div className="glass table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Requests</th>
                      <th>Tokens In</th>
                      <th>Tokens Out</th>
                      <th>Errors</th>
                      <th>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(m.models)
                      .sort((a, b) => b[1].requests - a[1].requests)
                      .map(([model, s]) => (
                        <tr key={model}>
                          <td className="mono" style={{ color: "var(--text-primary)" }}>{model}</td>
                          <td>{fmt(s.requests)}</td>
                          <td>{fmt(s.tokensIn)}</td>
                          <td>{fmt(s.tokensOut)}</td>
                          <td className={s.errors > 0 ? "err" : ""}>{s.errors}</td>
                          <td>{s.avgLatencyMs.toFixed(0)}ms</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="section" id="endpoints">
        <div className="section-label">Endpoints</div>
        <div className="glass endpoints">
          <div className="endpoint">
            <span className="method post">POST</span>
            <code>/v1/chat/completions</code>
            <span className="desc">OpenAI-compatible</span>
          </div>
          <div className="endpoint">
            <span className="method post">POST</span>
            <code>/v1/messages</code>
            <span className="desc">Anthropic Messages</span>
          </div>
          <div className="endpoint">
            <span className="method post">POST</span>
            <code>/v1/responses</code>
            <span className="desc">OpenAI Responses</span>
          </div>
          <div className="endpoint">
            <span className="method post">POST</span>
            <code>/v1/embeddings</code>
            <span className="desc">Embeddings</span>
          </div>
          <div className="endpoint">
            <span className="method post">POST</span>
            <code>/v1/images/generations</code>
            <span className="desc">Image generation</span>
          </div>
          <div className="endpoint">
            <span className="method get">GET</span>
            <code>/v1/models</code>
          </div>
          <div className="endpoint">
            <span className="method get">GET</span>
            <code>/v1/tools</code>
          </div>
        </div>
      </div>

      <div className="section" id="docs">
        <div className="section-label">Quick Start</div>

        <div className="glass code-block" style={{ marginBottom: "0.8rem" }}>
          <div className="code-header">
            <span>Python (OpenAI SDK)</span>
            <CopyButton text={`from openai import OpenAI\n\nclient = OpenAI(base_url=\"${BASE}/v1\", api_key=\"YOUR_API_KEY\")\nr = client.chat.completions.create(model=\"auto\", messages=[{\"role\":\"user\",\"content\":\"Hello\"}])\nprint(r.choices[0].message.content)`} />
          </div>
          <pre>{`from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key="YOUR_API_KEY")
r = client.chat.completions.create(model="auto", messages=[{"role":"user","content":"Hello"}])
print(r.choices[0].message.content)`}</pre>
        </div>

        <div className="glass code-block" style={{ marginBottom: "0.8rem" }}>
          <div className="code-header">
            <span>Python (Anthropic SDK)</span>
            <CopyButton text={`import anthropic\n\nclient = anthropic.Anthropic(base_url=\"${BASE}/v1\", api_key=\"YOUR_API_KEY\")\nm = client.messages.create(model=\"auto\", max_tokens=1024, messages=[{\"role\":\"user\",\"content\":\"Hello\"}])\nprint(m.content[0].text)`} />
          </div>
          <pre>{`import anthropic

client = anthropic.Anthropic(base_url="${BASE}/v1", api_key="YOUR_API_KEY")
m = client.messages.create(model="auto", max_tokens=1024, messages=[{"role":"user","content":"Hello"}])
print(m.content[0].text)`}</pre>
        </div>

        <div className="glass code-block">
          <div className="code-header">
            <span>cURL</span>
            <CopyButton text={`curl -X POST ${BASE}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`} />
          </div>
          <pre>{`curl -X POST ${BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`}</pre>
        </div>
      </div>

      <footer className="footer">
        <span>huyyhere-gateway</span>
        <span>v0.2.0</span>
      </footer>
    </div>
  );
}
