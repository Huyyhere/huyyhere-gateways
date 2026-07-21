import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HuyyHere Gateways",
  description: "AI API gateway — OpenAI & Anthropic compatible, 9 models, 59 tools, intelligent routing",
  icons: { icon: "/favicon.ico" },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
