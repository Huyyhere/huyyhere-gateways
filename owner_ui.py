#!/usr/bin/env python3
"""HuyyHere Gateway - Full Owner Management Server (Hardened)"""

import json
import os
import secrets
import urllib.request
import urllib.error
from aiohttp import web
from html import escape as html_escape

GATEWAY = os.environ.get("GATEWAY_URL", "https://huyyhere-gateways.vercel.app")
OWNER_KEY = os.environ.get("OWNER_SECRET")
if not OWNER_KEY:
    raise SystemExit("OWNER_SECRET env var is required")
PORT = int(os.environ.get("PORT", 8888))
SESSION_SECRET = secrets.token_hex(32)
SESSION_TTL = 3600 * 8  # 8 hours

sessions = {}


def sanitize_input(val, max_len=500):
    if not isinstance(val, str):
        return val
    cleaned = val.replace("<", "").replace(">", "").replace('"', "").replace("'", "")
    return cleaned[:max_len]


def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f"{GATEWAY}{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {OWNER_KEY}",
            "Content-Type": "application/json",
        },
        data=data,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def check_session(request):
    token = request.cookies.get("session")
    if token and token in sessions:
        entry = sessions[token]
        import time
        if time.time() - entry["created"] < SESSION_TTL:
            return True
        del sessions[token]
    return False


def require_auth(handler):
    async def wrapped(request):
        if not check_session(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        return await handler(request)
    return wrapped


async def handle_login(request):
    body = await request.json()
    password = body.get("password", "")
    if not secrets.compare_digest(password, OWNER_KEY):
        return web.json_response({"error": "invalid password"}, status=401)

    token = secrets.token_hex(32)
    import time
    sessions[token] = {"created": time.time()}
    resp = web.json_response({"ok": True})
    resp.set_cookie("session", token, httponly=True, samesite="Lax", secure=True, max_age=SESSION_TTL)
    return resp


async def handle_logout(request):
    token = request.cookies.get("session")
    if token and token in sessions:
        del sessions[token]
    resp = web.json_response({"ok": True})
    resp.del_cookie("session")
    return resp


async def handle_login_page(request):
    return web.Response(text=LOGIN_HTML, content_type="text/html")


async def handle_index(request):
    if not check_session(request):
        raise web.HTTPFound("/login")
    return web.Response(text=HTML, content_type="text/html")


@require_auth
async def handle_stats(request):
    try:
        data = api("GET", "/api/owner/stats")
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)


@require_auth
async def handle_proxy(request):
    path = request.match_info["path"]
    qs = f"?{request.query_string}" if request.query_string else ""
    method = request.method
    body = None
    if method in ("POST", "PATCH", "PUT"):
        try:
            body = await request.json()
            if isinstance(body, dict):
                for k, v in body.items():
                    if isinstance(v, str):
                        body[k] = sanitize_input(v)
        except Exception:
            pass
    try:
        data = api(method, f"/api/owner/{path}{qs}", body)
        return web.json_response(data)
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode()
        try:
            return web.json_response(json.loads(resp_body), status=e.code)
        except Exception:
            return web.Response(text=resp_body, status=e.code)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)


@require_auth
@require_auth
async def handle_playground(request):
    body = await request.json()
    model = sanitize_input(body.get("model", ""), 100)
    msg = sanitize_input(body.get("message", ""), 8000)
    stream = bool(body.get("stream"))
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": msg}],
        "stream": stream,
    }).encode()

    req = urllib.request.Request(
        f"{GATEWAY}/v1/chat/completions",
        method="POST",
        headers={
            "Authorization": f"Bearer {OWNER_KEY}",
            "Content-Type": "application/json",
        },
        data=payload,
    )
    try:
        if stream:
            resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
            await resp.prepare(request)
            with urllib.request.urlopen(req, timeout=60) as upstream:
                for chunk in upstream:
                    await resp.write(chunk)
            await resp.write_eof()
            return resp
        with urllib.request.urlopen(req, timeout=60) as upstream:
            return web.json_response(json.loads(upstream.read()))
    except urllib.error.HTTPError as e:
        return web.json_response({"error": e.read().decode()}, status=e.code)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)


async def handle_backup_export(request):
    try:
        data = api("GET", "/api/owner/backup")
        resp = web.json_response(data)
        resp.headers["Content-Disposition"] = (
            f'attachment; filename="gateway-backup.json"'
        )
        return resp
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)


@require_auth
async def handle_backup_import(request):
    try:
        body = await request.json()
        data = api("POST", "/api/owner/backup", body)
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=502)


LOGIN_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login - HuyyHere Gateway</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a1a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.login{background:#16213e;border-radius:12px;padding:40px;width:380px;border:1px solid #222}
.login h1{color:#e94560;font-size:18px;margin-bottom:8px;text-align:center}
.login p{color:#666;font-size:13px;text-align:center;margin-bottom:24px}
.login input{width:100%;padding:12px 16px;background:#0a0a1a;color:#fff;border:1px solid #333;border-radius:8px;font-size:14px;margin-bottom:16px}
.login input:focus{outline:none;border-color:#e94560}
.login button{width:100%;padding:12px;background:#e94560;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
.login button:hover{background:#c0392b}
.err{color:#e74c3c;font-size:12px;text-align:center;margin-top:8px;display:none}
</style>
</head>
<body>
<div class="login">
  <h1>HuyyHere Gateway</h1>
  <p>Enter your owner password to continue</p>
  <input id="pw" type="password" placeholder="Owner password" autofocus>
  <button onclick="doLogin()">Login</button>
  <div class="err" id="err"></div>
</div>
<script>
async function doLogin(){
  const pw=document.getElementById('pw').value;
  const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
  if(r.ok){location.href='/'}
  else{document.getElementById('err').textContent='Invalid password';document.getElementById('err').style.display='block'}
}
document.getElementById('pw').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
</script>
</body>
</html>"""


HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HuyyHere Gateway Manager</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a1a;color:#e0e0e0;min-height:100vh}
.header{background:linear-gradient(135deg,#1a1a3e 0%,#0f3460 100%);padding:20px 30px;border-bottom:2px solid #e94560;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:20px;color:#fff}.header .ver{color:#888;font-size:12px}
.header-right{display:flex;gap:12px;align-items:center}
.tabs{display:flex;gap:0;background:#111;border-bottom:1px solid #222;overflow-x:auto}
.tab{padding:12px 18px;cursor:pointer;color:#888;border-bottom:2px solid transparent;transition:.2s;white-space:nowrap;font-size:13px}
.tab:hover{color:#ccc}.tab.active{color:#e94560;border-bottom-color:#e94560;background:#1a1a2e}
.content{padding:20px 30px;max-width:1200px;margin:0 auto}
.section{display:none}.section.active{display:block}
h2{color:#e94560;font-size:16px;margin-bottom:15px;text-transform:uppercase;letter-spacing:1px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px}
.stat{background:#16213e;border-radius:8px;padding:16px;border:1px solid #222}
.stat .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px}
.stat .value{font-size:24px;font-weight:700;color:#00d2ff;margin-top:4px;font-family:'Courier New',monospace}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{text-align:left;padding:10px 12px;background:#16213e;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #222}
td{padding:10px 12px;border-bottom:1px solid #1a1a2e;font-size:13px;font-family:'Courier New',monospace}
tr:hover{background:#16213e}
.ok{color:#27ae60}.err{color:#e74c3c}.warn{color:#f39c12}.info{color:#00d2ff}
.btn{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:.2s}
.btn-primary{background:#0f3460;color:#fff}.btn-primary:hover{background:#1a4a8a}
.btn-danger{background:#e74c3c;color:#fff}.btn-danger:hover{background:#c0392b}
.btn-success{background:#27ae60;color:#fff}.btn-success:hover{background:#219a52}
.btn-sm{padding:5px 10px;font-size:11px}
.actions{display:flex;gap:8px;margin:15px 0;align-items:center}
input,select,textarea{background:#16213e;color:#fff;border:1px solid #333;padding:8px 12px;border-radius:6px;font-size:13px}
input:focus,select:focus,textarea:focus{outline:none;border-color:#e94560}
.form-row{display:flex;gap:12px;margin-bottom:12px;align-items:end;flex-wrap:wrap}
.form-group{display:flex;flex-direction:column;gap:4px}
.form-group label{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
#toast{position:fixed;bottom:20px;right:20px;background:#16213e;color:#00d2ff;padding:12px 20px;border-radius:8px;border:1px solid #0f3460;display:none;z-index:100;font-size:13px;animation:fadeIn .3s}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.badge-ok{background:#27ae6022;color:#27ae60;border:1px solid #27ae6044}
.badge-err{background:#e74c3c22;color:#e74c3c;border:1px solid #e74c3c44}
.badge-warn{background:#f39c1222;color:#f39c12;border:1px solid #f39c1244}
.provider-card{background:#16213e;border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid #222}
.provider-card h3{color:#fff;font-size:15px;margin-bottom:8px}
.provider-card .meta{color:#888;font-size:12px}
.health-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.health-item{background:#16213e;border-radius:6px;padding:12px;border:1px solid #222;display:flex;justify-content:space-between;align-items:center}
.health-item .model{font-weight:600;font-size:13px}
.health-item .detail{color:#888;font-size:11px}
.spinner{display:inline-block;width:16px;height:16px;border:2px solid #333;border-top-color:#e94560;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.code{background:#0a0a1a;padding:16px;border-radius:8px;font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;overflow-x:auto;border:1px solid #222;min-height:100px}
.webhook-card{background:#16213e;border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid #222;display:flex;justify-content:space-between;align-items:center}
.webhook-card .info{flex:1}
.webhook-card .name{font-weight:600;color:#fff}
.webhook-card .url{color:#888;font-size:12px;margin-top:4px}
.backup-area{background:#16213e;border-radius:8px;padding:20px;border:1px solid #222;margin-bottom:15px}
.backup-area p{color:#888;font-size:13px;margin-bottom:12px}
</style>
</head>
<body>
<div class="header">
  <h1>HuyyHere Gateway Manager</h1>
  <div class="header-right">
    <span class="ver">v0.2.0</span>
    <span id="conn" style="color:#888">connecting...</span>
    <button class="btn btn-sm" style="color:#888;border:1px solid #333;background:transparent" onclick="doLogout()">Logout</button>
  </div>
</div>
<div class="tabs">
  <div class="tab active" data-tab="stats">Stats</div>
  <div class="tab" data-tab="providers">Providers</div>
  <div class="tab" data-tab="models">Models</div>
  <div class="tab" data-tab="health">Health</div>
  <div class="tab" data-tab="keys">API Keys</div>
  <div class="tab" data-tab="logs">Logs</div>
  <div class="tab" data-tab="breakers">Breakers</div>
  <div class="tab" data-tab="webhooks">Webhooks</div>
  <div class="tab" data-tab="backup">Backup</div>
  <div class="tab" data-tab="config">Config</div>
  <div class="tab" data-tab="audit">Audit</div>
  <div class="tab" data-tab="playground">Playground</div>
</div>
<div class="content">

  <!-- STATS -->
  <div id="stats" class="section active">
    <h2>Gateway Stats</h2>
    <div class="stats-grid" id="stats-grid"></div>
    <h2>Models (24h)</h2>
    <table><thead><tr><th>Model</th><th>Requests</th><th>Tokens In</th><th>Tokens Out</th><th>Errors</th><th>Latency</th></tr></thead><tbody id="stats-models"></tbody></table>
  </div>

  <!-- PROVIDERS -->
  <div id="providers" class="section">
    <h2>Providers</h2>
    <div class="actions"><button class="btn btn-primary" onclick="loadProviders()">Refresh</button></div>
    <div id="providers-list"></div>
  </div>

  <!-- MODELS -->
  <div id="models" class="section">
    <h2>Registered Models</h2>
    <table><thead><tr><th>Model</th><th>Status</th><th>Vision</th><th>Tools</th><th>Context</th><th>Upstream</th></tr></thead><tbody id="models-list"></tbody></table>
  </div>

  <!-- HEALTH -->
  <div id="health" class="section">
    <h2>Model Health Check</h2>
    <div class="actions">
      <button class="btn btn-success" onclick="runHealthCheck()" id="health-btn">Run Health Check</button>
      <span id="health-status" style="color:#888;font-size:13px"></span>
    </div>
    <div id="health-results" class="health-grid"></div>
  </div>

  <!-- API KEYS -->
  <div id="keys" class="section">
    <h2>API Keys</h2>
    <div class="actions">
      <button class="btn btn-success" onclick="showCreateKey()">+ Create Key</button>
      <button class="btn btn-primary" onclick="loadKeys()">Refresh</button>
    </div>
    <div id="create-key-form" style="display:none;background:#16213e;padding:16px;border-radius:8px;margin-bottom:15px;border:1px solid #27ae60">
      <div class="form-row">
        <div class="form-group"><label>Name</label><input id="key-name" placeholder="e.g. my-app" maxlength="50"></div>
        <div class="form-group"><label>Token Limit</label><input id="key-limit" type="number" value="1000000" min="0" max="100000000"></div>
        <button class="btn btn-success" onclick="createKey()">Create</button>
        <button class="btn" style="color:#888" onclick="$('#create-key-form').style.display='none'">Cancel</button>
      </div>
    </div>
    <table><thead><tr><th>Name</th><th>Key</th><th>Usage</th><th>Requests</th><th>Status</th><th>Actions</th></tr></thead><tbody id="keys-list"></tbody></table>
  </div>

  <!-- LOGS -->
  <div id="logs" class="section">
    <h2>Recent Logs</h2>
    <div class="actions">
      <button class="btn btn-primary" onclick="loadLogs()">Refresh</button>
      <select id="log-model-filter" onchange="loadLogs()" style="padding:6px 10px"><option value="">All Models</option></select>
    </div>
    <table><thead><tr><th>Time</th><th>Model</th><th>Status</th><th>Latency</th><th>Tokens In</th><th>Tokens Out</th><th>Error</th></tr></thead><tbody id="logs-list"></tbody></table>
  </div>

  <!-- BREAKERS -->
  <div id="breakers" class="section">
    <h2>Circuit Breakers</h2>
    <div class="actions"><button class="btn btn-primary" onclick="loadBreakers()">Refresh</button></div>
    <table><thead><tr><th>Model</th><th>State</th><th>Fails</th><th>Action</th></tr></thead><tbody id="breakers-list"></tbody></table>
  </div>

  <!-- WEBHOOKS -->
  <div id="webhooks" class="section">
    <h2>Webhooks</h2>
    <div class="actions">
      <button class="btn btn-success" onclick="showCreateWebhook()">+ Add Webhook</button>
      <button class="btn btn-primary" onclick="loadWebhooks()">Refresh</button>
    </div>
    <div id="create-webhook-form" style="display:none;background:#16213e;padding:16px;border-radius:8px;margin-bottom:15px;border:1px solid #27ae60">
      <div class="form-row">
        <div class="form-group"><label>Name</label><input id="wh-name" placeholder="e.g. alerts" maxlength="50"></div>
        <div class="form-group"><label>Type</label><select id="wh-type"><option value="telegram">Telegram</option><option value="discord">Discord</option><option value="custom">Custom</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Webhook URL</label><input id="wh-url" type="url" placeholder="https://..." style="width:400px"></div>
      </div>
      <div class="form-row">
        <button class="btn btn-success" onclick="createWebhook()">Create</button>
        <button class="btn" style="color:#888" onclick="$('#create-webhook-form').style.display='none'">Cancel</button>
      </div>
    </div>
    <div id="webhooks-list"></div>
  </div>

  <!-- BACKUP -->
  <div id="backup" class="section">
    <h2>Backup &amp; Restore</h2>
    <div class="backup-area">
      <p>Export a full JSON backup of all gateway data (API keys, config, webhooks, audit logs).</p>
      <button class="btn btn-success" onclick="exportBackup()">Export Backup</button>
    </div>
    <div class="backup-area">
      <p>Import a JSON backup. This will overwrite existing data.</p>
      <input type="file" id="backup-file" accept=".json" style="margin-bottom:12px">
      <button class="btn btn-danger" onclick="importBackup()">Import Backup</button>
    </div>
  </div>

  <!-- CONFIG -->
  <div id="config" class="section">
    <h2>System Config</h2>
    <div class="actions"><button class="btn btn-primary" onclick="loadConfig()">Refresh</button></div>
    <div id="config-content" class="code" contenteditable="true" style="min-height:200px"></div>
    <div class="actions" style="margin-top:15px">
      <button class="btn btn-primary" onclick="saveConfig()">Save Config</button>
    </div>
  </div>

  <!-- AUDIT -->
  <div id="audit" class="section">
    <h2>Audit Log</h2>
    <div class="actions"><button class="btn btn-primary" onclick="loadAudit()">Refresh</button></div>
    <div id="audit-list"></div>
  </div>

  <!-- PLAYGROUND -->
  <div id="playground" class="section">
    <h2>API Playground</h2>
    <p style="color:#888;margin-bottom:15px;font-size:13px">Test your gateway with an API key.</p>
    <div class="form-row">
      <div class="form-group"><label>Model</label><select id="pg-model" style="width:200px"></select></div>
    </div>
    <div style="margin-bottom:12px">
      <label style="color:#888;font-size:12px">Message</label><br>
      <textarea id="pg-msg" rows="3" style="width:100%;resize:vertical" placeholder="Type your message..."></textarea>
    </div>
    <div class="form-row">
      <button class="btn btn-primary" onclick="sendPlayground()">Send</button>
      <label style="color:#888;font-size:12px"><input type="checkbox" id="pg-stream"> Stream</label>
    </div>
    <div id="pg-result" class="code" style="margin-top:15px;display:none;max-height:500px;overflow-y:auto"></div>
  </div>
</div>
<div id="toast"></div>

<script>
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let allKeys = [];

$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.section').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $(`#${t.dataset.tab}`).classList.add('active');
});

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 2500);
}

function fmt(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1)+'B';
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
  return String(n);
}

function fmtPct(used, limit) {
  if (!limit) return 'unlimited';
  const pct = (used / limit * 100).toFixed(1);
  return `${fmt(used)} / ${fmt(limit)} (${pct}%)`;
}

async function apiCall(method, path, body) {
  const opts = {method};
  if (body) { opts.headers = {'Content-Type':'application/json'}; opts.body = JSON.stringify(body); }
  const r = await fetch(`/api/${path}`, opts);
  if (r.status === 401) { location.href = '/login'; return null; }
  return r.json();
}

async function doLogout() {
  await fetch('/logout', {method:'POST'});
  location.href = '/login';
}

// === STATS ===
async function loadStats() {
  try {
    const d = await apiCall('GET', 'stats');
    if (!d) return;
    const s = d.summary || {};
    $('#stats-grid').innerHTML = [
      ['Requests', fmt(s.totalRequests||0), ''],
      ['Tokens In', fmt(s.totalTokensIn||0), ''],
      ['Tokens Out', fmt(s.totalTokensOut||0), ''],
      ['Errors', s.totalErrors||0, Number(s.errorRate)>0?'err':''],
      ['Error Rate', s.errorRate||'0%', Number(s.errorRate)>0?'err':''],
      ['Uptime', s.uptime||'-', ''],
    ].map(([l,v,c]) => `<div class="stat"><div class="label">${l}</div><div class="value ${c}">${v}</div></div>`).join('');

    const models = Object.entries(d.models||{}).sort((a,b) => (b[1].requests||0)-(a[1].requests||0));
    $('#stats-models').innerHTML = models.map(([m,s]) =>
      `<tr><td>${m}</td><td>${fmt(s.requests||0)}</td><td>${fmt(s.tokensIn||0)}</td><td>${fmt(s.tokensOut||0)}</td><td class="${s.errors>0?'err':''}">${s.errors||0}</td><td>${(s.avgLatencyMs||0).toFixed(0)}ms</td></tr>`
    ).join('') || '<tr><td colspan="6" style="color:#666">No data yet</td></tr>';

    $('#conn').textContent = 'connected';
    $('#conn').style.color = '#27ae60';
  } catch(e) {
    $('#conn').textContent = 'error';
    $('#conn').style.color = '#e74c3c';
  }
}

// === PROVIDERS ===
async function loadProviders() {
  const d = await apiCall('GET', 'providers');
  if (!d) return;
  $('#providers-list').innerHTML = (d.providers||[]).map(p => `
    <div class="provider-card">
      <h3>${p.name} <span class="badge ${p.status==='configured'?'badge-ok':'badge-err'}">${p.status}</span></h3>
      <div class="meta">
        <div>Base URL: <span style="color:#fff">${p.baseUrl}</span></div>
        <div>API Keys: <span style="color:#fff">${p.keyCount}</span></div>
        <div>Models: <span style="color:#fff">${(p.models||[]).join(', ')}</span></div>
      </div>
    </div>
  `).join('') || '<div style="color:#666">No providers configured</div>';
}

// === MODELS ===
async function loadModels() {
  const d = await apiCall('GET', 'models');
  if (!d) return;
  $('#models-list').innerHTML = (d.models||[]).filter(m => m.id !== 'auto').map(m => {
    const cap = m.capabilities||{};
    const route = m.route||{};
    return `<tr>
      <td>${m.id}</td>
      <td>${m.available?'<span class="badge badge-ok">Active</span>':'<span class="badge badge-err">Unavailable</span>'}</td>
      <td>${cap.vision?'<span class="ok">\u2713</span>':''}</td>
      <td>${cap.tools?'<span class="ok">\u2713</span>':''}</td>
      <td>${cap.contextLength?fmt(cap.contextLength):''}</td>
      <td style="color:#666">${route.upstreamModel||''}</td>
    </tr>`;
  }).join('');

  const sel = $('#pg-model');
  sel.innerHTML = (d.models||[]).filter(m=>m.id!=='auto').map(m=>`<option value="${m.id}">${m.id}</option>`).join('');

  const logSel = $('#log-model-filter');
  logSel.innerHTML = '<option value="">All Models</option>' + (d.models||[]).filter(m=>m.id!=='auto').map(m=>`<option value="${m.id}">${m.id}</option>`).join('');
}

// === HEALTH ===
async function runHealthCheck() {
  const btn = $('#health-btn');
  const status = $('#health-status');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  status.innerHTML = '<span class="spinner"></span> Testing all models...';
  $('#health-results').innerHTML = '';

  try {
    const d = await apiCall('GET', 'health');
    if (!d) return;
    status.innerHTML = `<span class="badge badge-ok">${d.summary?.ok||0}/${d.summary?.total||0} healthy</span>`;

    $('#health-results').innerHTML = (d.results||[]).map(r => `
      <div class="health-item">
        <div>
          <div class="model">${r.model}</div>
          <div class="detail">${r.latencyMs}ms${r.error ? ' - '+r.error : ''}</div>
        </div>
        <span class="badge ${r.status==='ok'?'badge-ok':'badge-err'}">${r.status}</span>
      </div>
    `).join('');
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
  }
  btn.disabled = false;
  btn.textContent = 'Run Health Check';
}

// === API KEYS ===
async function loadKeys() {
  const d = await apiCall('GET', 'keys');
  if (!d) return;
  allKeys = d.keys || [];
  renderKeys();
}

function renderKeys() {
  $('#keys-list').innerHTML = allKeys.map(k => {
    const pct = k.tokenLimit > 0 ? (k.tokensUsed / k.tokenLimit * 100) : 0;
    const bar = pct > 90 ? 'err' : pct > 70 ? 'warn' : 'ok';
    return `<tr>
      <td>${k.name}</td>
      <td><span style="color:#666">${k.preview || 'sk-gw-...????'}</span></td>
      <td class="${bar}">${fmtPct(k.tokensUsed, k.tokenLimit)}</td>
      <td>${k.requestCount||0}</td>
      <td>${k.active?'<span class="badge badge-ok">Active</span>':'<span class="badge badge-err">Disabled</span>'}</td>
      <td>
        <button class="btn btn-sm ${k.active?'btn-danger':'btn-success'}" onclick="toggleKey('${k.id}',${!k.active})">${k.active?'Disable':'Enable'}</button>
        <button class="btn btn-sm" style="color:#888;border:1px solid #333;background:transparent" onclick="resetKeyUsage('${k.id}')">Reset</button>
        <button class="btn btn-sm btn-danger" onclick="deleteKey('${k.id}','${k.name}')">Delete</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:#666">No API keys. Create one to get started.</td></tr>';
}

function showCreateKey() { $('#create-key-form').style.display = 'block'; $('#key-name').focus(); }

async function createKey() {
  const name = ($('#key-name').value || 'unnamed').replace(/[^a-zA-Z0-9_-]/g, '');
  const limit = parseInt($('#key-limit').value) || 1000000;
  const d = await apiCall('POST', 'keys', {name, tokenLimit: limit});
  $('#create-key-form').style.display = 'none';
  loadKeys();
  if (d && d.key && d.key.key) {
    prompt('Key created. Copy it now — it will not be shown again:', d.key.key);
  } else {
    toast('Key created');
  }
}

async function toggleKey(id, active) {
  await apiCall('PATCH', 'keys', {id, active});
  toast(active ? 'Key enabled' : 'Key disabled');
  loadKeys();
}

async function resetKeyUsage(id) {
  await apiCall('PATCH', 'keys', {id, resetUsage: true});
  toast('Usage reset');
  loadKeys();
}

async function deleteKey(id, name) {
  if (!confirm(`Delete key "${name}"?`)) return;
  await apiCall('DELETE', `keys?id=${id}`);
  toast('Key deleted');
  loadKeys();
}

// === LOGS ===
async function loadLogs() {
  const model = $('#log-model-filter').value;
  const d = await apiCall('GET', `logs?limit=100${model?'&model='+model:''}`);
  if (!d) return;
  $('#logs-list').innerHTML = (d.logs||[]).map(l =>
    `<tr>
      <td style="color:#666">${(l.timestamp||'').slice(0,19)}</td>
      <td>${l.model||''}</td>
      <td class="${l.status==='error'?'err':'ok'}">${l.status||''}</td>
      <td>${(l.latencyMs||0).toFixed(0)}ms</td>
      <td>${fmt(l.tokensIn||0)}</td>
      <td>${fmt(l.tokensOut||0)}</td>
      <td style="color:#e74c3c;font-size:11px">${l.error||''}</td>
    </tr>`
  ).join('') || '<tr><td colspan="7" style="color:#666">No logs yet</td></tr>';
}

// === BREAKERS ===
async function loadBreakers() {
  const d = await apiCall('GET', 'breakers');
  if (!d) return;
  const entries = Object.entries(d.breakers||{});
  $('#breakers-list').innerHTML = entries.length ? entries.map(([m,b]) =>
    `<tr>
      <td>${m}</td>
      <td><span class="badge ${b.state==='open'?'badge-err':b.state==='half-open'?'badge-warn':'badge-ok'}">${b.state}</span></td>
      <td>${b.failCount||0}</td>
      <td><button class="btn btn-danger btn-sm" onclick="resetBreaker('${m}')">Reset</button></td>
    </tr>`
  ).join('') : '<tr><td colspan="4" style="color:#666">No circuit breakers active</td></tr>';
}

async function resetBreaker(model) {
  await apiCall('DELETE', `breakers?model=${model}`);
  toast(`Reset ${model}`);
  loadBreakers();
}

// === WEBHOOKS ===
function showCreateWebhook() { $('#create-webhook-form').style.display = 'block'; $('#wh-name').focus(); }

async function loadWebhooks() {
  const d = await apiCall('GET', 'webhooks');
  if (!d) return;
  const hooks = d.webhooks || [];
  $('#webhooks-list').innerHTML = hooks.map(h => `
    <div class="webhook-card">
      <div class="info">
        <div class="name">${h.name} <span class="badge ${h.active?'badge-ok':'badge-err'}">${h.active?'Active':'Disabled'}</span></div>
        <div class="url">${h.type} &middot; ${h.url}</div>
      </div>
      <div>
        <button class="btn btn-sm ${h.active?'btn-danger':'btn-success'}" onclick="toggleWebhook('${h.id}',${!h.active})">${h.active?'Disable':'Enable'}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteWebhook('${h.id}','${h.name}')">Delete</button>
      </div>
    </div>
  `).join('') || '<div style="color:#666;padding:20px">No webhooks configured. Add one to get notifications for errors and alerts.</div>';
}

async function createWebhook() {
  const name = ($('#wh-name').value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const url = $('#wh-url').value || '';
  const type = $('#wh-type').value;
  if (!name || !url) { toast('Name and URL required'); return; }
  await apiCall('POST', 'webhooks', {name, url, type, events: []});
  toast('Webhook created');
  $('#create-webhook-form').style.display = 'none';
  loadWebhooks();
}

async function toggleWebhook(id, active) {
  await apiCall('PATCH', 'webhooks', {id, active});
  toast(active ? 'Webhook enabled' : 'Webhook disabled');
  loadWebhooks();
}

async function deleteWebhook(id, name) {
  if (!confirm(`Delete webhook "${name}"?`)) return;
  await apiCall('DELETE', `webhooks?id=${id}`);
  toast('Webhook deleted');
  loadWebhooks();
}

// === BACKUP ===
async function exportBackup() {
  try {
    const d = await apiCall('GET', 'backup');
    if (!d) return;
    const blob = new Blob([JSON.stringify(d, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gateway-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  } catch(e) {
    toast('Export failed: ' + e.message);
  }
}

async function importBackup() {
  const file = $('#backup-file').files[0];
  if (!file) { toast('Select a file first'); return; }
  if (!confirm('This will overwrite all gateway data. Continue?')) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const d = await apiCall('POST', 'backup', data);
    if (!d) return;
    toast(`Imported ${d.imported||0} documents`);
  } catch(e) {
    toast('Import failed: ' + e.message);
  }
}

// === CONFIG ===
async function loadConfig() {
  const d = await apiCall('GET', 'config');
  if (!d) return;
  $('#config-content').textContent = JSON.stringify(d.config, null, 2);
}

async function saveConfig() {
  try {
    const text = $('#config-content').textContent;
    const config = JSON.parse(text);
    await apiCall('PATCH', 'config', config);
    toast('Config saved');
  } catch(e) {
    toast('Invalid JSON: ' + e.message);
  }
}

// === AUDIT ===
async function loadAudit() {
  const d = await apiCall('GET', 'audit?limit=100');
  if (!d) return;
  $('#audit-list').innerHTML = (d.logs||[]).map(l =>
    `<div class="log-entry" style="padding:8px 12px;border-bottom:1px solid #1a1a2e;font-size:12px;display:flex;gap:12px">
      <span style="color:#666;min-width:140px">${(l.timestamp||'').slice(0,19)}</span>
      <span style="color:#e94560;font-weight:600;min-width:120px">${l.action||''}</span>
      <span style="color:#888">${l.detail||''}</span>
    </div>`
  ).join('') || '<div style="color:#666;padding:20px">No audit logs yet</div>';
}

// === PLAYGROUND ===
async function sendPlayground() {
  const model = $('#pg-model').value;
  const msg = $('#pg-msg').value;
  const stream = $('#pg-stream').checked;
  if (!msg) return;
  const el = $('#pg-result');
  el.style.display = 'block';

  if (stream) {
    el.textContent = '';
    try {
      const r = await fetch('/api/playground', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({model, message: msg, stream: true})
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      while(true) {
        const {done, value} = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const d = JSON.parse(line.slice(6));
              const content = d.choices?.[0]?.delta?.content || '';
              if (content) el.textContent += content;
            } catch {}
          }
        }
      }
    } catch(e) { el.textContent = 'Error: ' + e.message; }
  } else {
    el.textContent = 'Sending...';
    try {
      const r = await fetch('/api/playground', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({model, message: msg})
      });
      const d = await r.json();
      el.textContent = JSON.stringify(d, null, 2);
    } catch(e) { el.textContent = 'Error: ' + e.message; }
  }
}

// === INIT ===
loadStats(); loadModels(); loadProviders(); loadKeys(); loadLogs(); loadBreakers(); loadConfig(); loadAudit(); loadWebhooks();
setInterval(loadStats, 15000);
</script>
</body>
</html>"""

app = web.Application()
app.router.add_get("/login", handle_login_page)
app.router.add_get("/", handle_index)
app.router.add_post("/login", handle_login)
app.router.add_post("/logout", handle_logout)
app.router.add_route("*", "/api/{path:.*}", handle_proxy)
app.router.add_get("/api/backup/export", handle_backup_export)
app.router.add_post("/api/playground", handle_playground)
app.router.add_post("/api/backup/import", handle_backup_import)

if __name__ == "__main__":
    print(f"HuyyHere Gateway Manager v0.2.0 → http://localhost:{PORT}")
    print(f"Login with your OWNER_SECRET to access the dashboard.")
    web.run_app(app, port=PORT)
