import { ImageResponse } from "next/og";

// iPhone Add-to-Home-Screen tile (apple-touch-icon). Generated from code so we
// don't need a static asset; replace with app/apple-icon.png anytime to use a
// real image instead. iOS rounds the corners itself — render full-bleed.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(150deg, #38328c 0%, #221e57 100%)",
        }}
      >
        <div style={{ fontSize: 92, display: "flex" }}>🇺🇸</div>
        <div
          style={{
            marginTop: 4,
            fontSize: 32,
            fontWeight: 800,
            color: "#f2d50f",
            letterSpacing: 4,
            display: "flex",
          }}
        >
          2026
        </div>
      </div>
    ),
    { ...size, emoji: "twemoji" },
  );
}
