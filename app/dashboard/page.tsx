"use client";

import { useState } from "react";
import "../globals.css";

const BASE = "https://huyyhere-gateways.vercel.app";

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

type Tab = "quickstart" | "endpoints";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("quickstart");

  return (
    <div className="container">
      <nav className="nav">
        <div className="brand">
          <div className="brand-icon">H</div>
          huyyhere
        </div>
        <div className="nav-links">
          <a href="/">Home</a>
        </div>
      </nav>

      <div className="dash-tabs">
        {(["quickstart", "endpoints"] as Tab[]).map(t => (
          <button key={t} className={`dash-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "quickstart" ? "Quick Start" : "Endpoints"}
          </button>
        ))}
      </div>

      {tab === "quickstart" && (
        <div className="dash-panel active animate-in">
          <div className="section">
            <div className="section-label">Base URL</div>
            <div className="endpoint-box">
              <div className="endpoint-url">{BASE}/v1</div>
            </div>
          </div>

          <div className="section">
            <div className="section-label">API Key</div>
            <div className="api-key-box">
              <code>sk-gw-*** (get from owner_ui.py)</code>
            </div>
          </div>

          <div className="section">
            <div className="section-label">Python (OpenAI SDK)</div>
            <div className="glass code-block">
              <div className="code-header">
                <span>python</span>
                <CopyButton text={`from openai import OpenAI\n\nclient = OpenAI(base_url=\"${BASE}/v1\", api_key=\"sk-gw-***\")\nr = client.chat.completions.create(model=\"auto\", messages=[{\"role\":\"user\",\"content\":\"Hello\"}])\nprint(r.choices[0].message.content)`} />
              </div>
              <pre>{`from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key="sk-gw-***")
r = client.chat.completions.create(model="auto", messages=[{"role":"user","content":"Hello"}])
print(r.choices[0].message.content)`}</pre>
            </div>
          </div>

          <div className="section">
            <div className="section-label">Python (Anthropic SDK)</div>
            <div className="glass code-block">
              <div className="code-header">
                <span>python</span>
                <CopyButton text={`import anthropic\n\nclient = anthropic.Anthropic(base_url=\"${BASE}/v1\", api_key=\"sk-gw-***\")\nm = client.messages.create(model=\"auto\", max_tokens=1024, messages=[{\"role\":\"user\",\"content\":\"Hello\"}])\nprint(m.content[0].text)`} />
              </div>
              <pre>{`import anthropic

client = anthropic.Anthropic(base_url="${BASE}/v1", api_key="sk-gw-***")
m = client.messages.create(model="auto", max_tokens=1024, messages=[{"role":"user","content":"Hello"}])
print(m.content[0].text)`}</pre>
            </div>
          </div>

          <div className="section">
            <div className="section-label">cURL</div>
            <div className="glass code-block">
              <div className="code-header">
                <span>bash</span>
                <CopyButton text={`curl -X POST ${BASE}/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer sk-gw-***" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`} />
              </div>
              <pre>{`curl -X POST ${BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-gw-***" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":true}'`}</pre>
            </div>
          </div>
        </div>
      )}

      {tab === "endpoints" && (
        <div className="dash-panel active animate-in">
          <div className="section">
            <div className="section-label">API Endpoints</div>
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
        </div>
      )}

      <footer className="footer">
        <span>huyyhere-gateway</span>
        <span>v0.2.0</span>
      </footer>
    </div>
  );
}
