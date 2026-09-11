import type { NextConfig } from "next";
import path from "node:path";

/** Baseline browser protections: no framing (clickjacking of "I applied"/"Hide"), no MIME sniffing, trimmed referrers on outbound apply links. */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@foothold/shared"],
  turbopack: { root: path.resolve(__dirname, "../..") },
  serverExternalPackages: ["@react-pdf/renderer", "pg-boss", "pg", "unpdf", "mammoth", "posthog-node"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
