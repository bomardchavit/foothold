import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@foothold/shared"],
  turbopack: { root: path.resolve(__dirname, "../..") },
  serverExternalPackages: ["@react-pdf/renderer", "pg-boss", "pg", "unpdf", "mammoth", "posthog-node"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
