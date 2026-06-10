import { ImageResponse } from "next/og";

// Browser-tab favicon (the site had none). Same branding as the home-screen tile.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2d2a72",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 44, display: "flex" }}>🇺🇸</div>
      </div>
    ),
    { ...size, emoji: "twemoji" },
  );
}
