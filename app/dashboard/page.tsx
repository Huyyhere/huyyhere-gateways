"use client";

import { useEffect, useState, useCallback } from "react";
import "../globals.css";

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

interface UserInfo {
  id: string;
  username: string;
  apiKey: string;
  tokensUsed: number;
  tokensLimit: number;
  isOwner: boolean;
}

interface Metrics {
  summary: { totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalCost: string; totalErrors: number; errorRate: string; uptime: string };
  models: Record<string, { requests: number; tokensIn: number; tokensOut: number; errors: number; avgLatencyMs: number }>;
}

type Tab = "overview" | "models" | "api";

export default function Dashboard() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me").then(r => r.ok ? r.json() : Promise.reject()).then(setUser).catch(() => {
      window.location.href = "/login";
    }).finally(() => setLoading(false));
  }, []);

  const loadMetrics = useCallback(() => {
    fetch("/api/metrics").then(r => r.ok ? r.json() : null).then(setMetrics).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      loadMetrics();
      const iv = setInterval(loadMetrics, 30000);
      return () => clearInterval(iv);
    }
  }, [user, loadMetrics]);

  if (loading) {
    return (
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <div style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.85rem" }}>Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  const usagePct = user.tokensLimit > 0 ? Math.min((user.tokensUsed / user.tokensLimit) * 100, 100) : 0;

  return (
    <div className="container">
      <nav className="nav">
        <div className="brand">
          <div className="brand-icon">H</div>
          huyyhere
        </div>
        <div className="nav-links">
          <a href="/">Home</a>
          <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
            {user.username}
          </span>
          <button
            className="btn-secondary"
            style={{ fontSize: "0.78rem", padding: "0.4rem 0.9rem" }}
            onClick={() => {
              fetch("/api/oauth2/logout", { method: "POST" }).then(() => window.location.href = "/");
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="dash-tabs">
        {(["overview", "models", "api"] as Tab[]).map(t => (
          <button key={t} className={`dash-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "overview" ? "Overview" : t === "models" ? "Models" : "API"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="dash-panel active animate-in">
          <div className="section">
            <div className="section-label">Your Endpoint</div>
            <div className="endpoint-box">
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Base URL
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                <span className="endpoint-url">{BASE}/v1</span>
                <CopyButton text={`${BASE}/v1`} />
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-label">API Key</div>
            <div className="api-key-box">
              <code>{user.apiKey}</code>
              <CopyButton text={user.apiKey} />
            </div>
          </div>

          <div className="section">
            <div className="section-label">Usage</div>
            <div className="stats-grid">
              <div className="glass stat-card">
                <div className="stat-label">Used</div>
                <div className="stat-value">{fmt(user.tokensUsed)}</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-label">Limit</div>
                <div className="stat-value">{fmt(user.tokensLimit)}</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-label">Remaining</div>
                <div className="stat-value">{fmt(Math.max(user.tokensLimit - user.tokensUsed, 0))}</div>
              </div>
              <div className="glass stat-card">
                <div className="stat-label">Usage</div>
                <div className="stat-value">{usagePct.toFixed(1)}%</div>
              </div>
            </div>
            <div style={{ marginTop: "0.8rem", height: "4px", borderRadius: "2px", background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${usagePct}%`, background: usagePct > 90 ? "var(--red)" : "var(--accent)", borderRadius: "2px", transition: "width 0.5s ease" }} />
            </div>
          </div>

          {metrics && (
            <div className="section">
              <div className="section-label">Gateway Stats</div>
              <div className="stats-grid">
                <div className="glass stat-card">
                  <div className="stat-label">Total Requests</div>
                  <div className="stat-value">{fmt(metrics.summary.totalRequests)}</div>
                </div>
                <div className="glass stat-card">
                  <div className="stat-label">Tokens In</div>
                  <div className="stat-value">{fmt(metrics.summary.totalTokensIn)}</div>
                </div>
                <div className="glass stat-card">
                  <div className="stat-label">Tokens Out</div>
                  <div className="stat-value">{fmt(metrics.summary.totalTokensOut)}</div>
                </div>
                <div className={`glass stat-card ${Number(metrics.summary.errorRate) > 0 ? "err" : ""}`}>
                  <div className="stat-label">Error Rate</div>
                  <div className="stat-value">{metrics.summary.errorRate}</div>
                </div>
                <div className="glass stat-card">
                  <div className="stat-label">Uptime</div>
                  <div className="stat-value">{metrics.summary.uptime}</div>
                </div>
              </div>
            </div>
          )}

          <div className="section">
            <div className="section-label">Quick Start</div>
            <div className="glass code-block">
              <div className="code-header">
                <span>Python</span>
                <CopyButton text={`from openai import OpenAI\n\nclient = OpenAI(base_url=\"${BASE}/v1\", api_key=\"${user.apiKey}\")\nr = client.chat.completions.create(model=\"auto\", messages=[{\"role\":\"user\",\"content\":\"Hello\"}])\nprint(r.choices[0].message.content)`} />
              </div>
              <pre>{`from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key="${user.apiKey}")
r = client.chat.completions.create(model="auto", messages=[{"role":"user","content":"Hello"}])
print(r.choices[0].message.content)`}</pre>
            </div>
          </div>
        </div>
      )}

      {tab === "models" && (
        <div className="dash-panel active animate-in">
          <div className="section">
            <div className="section-label">Available Models</div>
            <div className="models-grid">
              {MODELS.map(id => (
                <div className="glass model-card" key={id}>
                  <span className="model-dot" />
                  <span className="model-name">{id}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-label">Model Details</div>
            <div className="glass table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Vision</th>
                    <th>Tools</th>
                    <th>Context</th>
                    <th>Max Output</th>
                  </tr>
                </thead>
                <tbody>
                  {MODELS.filter(m => m !== "auto").map(id => (
                    <tr key={id}>
                      <td className="mono" style={{ color: "var(--text-primary)" }}>{id}</td>
                      <td>—</td>
                      <td>✓</td>
                      <td>128K</td>
                      <td>8-16K</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "api" && (
        <div className="dash-panel active animate-in">
          <div className="section">
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
                <span className="desc">List models</span>
              </div>
              <div className="endpoint">
                <span className="method get">GET</span>
                <code>/v1/tools</code>
                <span className="desc">List tools</span>
              </div>
              <div className="endpoint">
                <span className="method get">GET</span>
                <code>/api/health</code>
                <span className="desc">Health check</span>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-label">Python (OpenAI SDK)</div>
            <div className="glass code-block">
              <div className="code-header">
                <span>python</span>
                <CopyButton text={`from openai import OpenAI\n\nclient = OpenAI(base_url=\"${BASE}/v1\", api_key=\"${user.apiKey}\")\nr = client.chat.completions.create(model=\"auto\", messages=[{\"role\":\"user\",\"content\":\"Hello\"}])\nprint(r.choices[0].message.content)`} />
              </div>
              <pre>{`from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key="${user.apiKey}")
r = client.chat.completions.create(model="auto", messages=[{"role":"user","content":"Hello"}])
print(r.choices[0].message.content)`}</pre>
            </div>
          </div>

          <div className="section">
            <div className="section-label">Python (Anthropic SDK)</div>
            <div className="glass code-block">
              <div className="code-header">
                <span>python</span>
                <CopyButton text={`import anthropic\n\nclient = anthropic.Anthropic(base_url=\"${BASE}/v1\", api_key=\"${user.apiKey}\")\nm = client.messages.create(model=\"auto\", max_tokens=1024, messages=[{\"role\":\"user\",\"content\":\"Hello\"}])\nprint(m.content[0].text)`} />
              </div>
              <pre>{`import anthropic

client = anthropic.Anthropic(base_url="${BASE}/v1", api_key="${user.apiKey}")
m = client.messages.create(model="auto", max_tokens=1024, messages=[{"role":"user","content":"Hello"}])
print(m.content[0].text)`}</pre>
            </div>
          </div>

          <div className="section">
            <div className="section-label">cURL</div>
            <div className="glass code-block">
              <div className="code-header">
                <span>bash</span>
                <CopyButton text={`curl -X POST ${BASE}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${user.apiKey}" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`} />
              </div>
              <pre>{`curl -X POST ${BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${user.apiKey}" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`}</pre>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <span>huyyhere-gateway</span>
        <span>v0.2.0</span>
      </footer>
    </div>
  );
}
