export default function Home() {
  return <div style={{ fontFamily: "system-ui, sans-serif", background: "#0a0f1e", color: "#e2e8f0", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, margin: 0 }}>
    <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Huyyhere Gateway</h1>
    <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Use <code style={{ color: "#818cf8", background: "rgba(129,140,248,0.1)", padding: "2px 6px", borderRadius: 4 }}>/api/v1/chat/completions</code> with your API key.</p>
  </div>;
}
