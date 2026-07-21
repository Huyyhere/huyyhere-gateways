"use client";

import "./globals.css";

export default function Home() {
  return (
    <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🔒</div>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "2rem", fontWeight: 700, marginBottom: "0.8rem" }}>
          HuyyHere Gateway
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1rem", lineHeight: 1.7 }}>
          Dịch vụ đã ngừng hoạt động.
        </p>
      </div>
    </div>
  );
}
