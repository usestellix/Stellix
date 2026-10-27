import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { RELEASE, SHIELD_LAUNCHED } from "@/content/shield-status";

// The site-wide link preview, rendered once at build time. Geist TTFs (the renderer can't read
// woff2) are vendored in src/fonts/og from the same geist@1.7.2 package; they never ship.
// Rendered once at build: required for metadata images under output: "export".
export const dynamic = "force-static";
export const alt = "Stellix";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (file: string) => readFileSync(path.join(process.cwd(), "src/fonts/og", file));

export default function OpengraphImage() {
  const line = SHIELD_LAUNCHED
    ? "The Stellar wallet that shows you what you're signing."
    : "A non-custodial Stellar wallet for your browser.";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#f6f6f5",
        color: "#111113",
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="56" height="56" viewBox="0 0 20 20">
          <rect width="20" height="20" rx="5.5" fill="#111113" />
          <path d="M10 5.25 14.75 10 10 14.75 5.25 10Z" fill="#f6f6f5" />
        </svg>
        <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em" }}>Stellix</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <span style={{ fontSize: 72, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          {line}
        </span>
        {!RELEASE.mainnet && (
          <span style={{ fontSize: 30, fontWeight: 400, color: "#6c6c73" }}>
            Browser extension · testnet release
          </span>
        )}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: font("Geist-Regular.ttf"), weight: 400, style: "normal" },
        { name: "Geist", data: font("Geist-SemiBold.ttf"), weight: 600, style: "normal" },
      ],
    },
  );
}
