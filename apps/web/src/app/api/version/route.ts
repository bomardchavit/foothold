import { NextResponse } from "next/server";
import pkg from "../../../../package.json";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * Identifies this server to the desktop app (which probes it before saving a server URL) and to anything checking what
 * is deployed. No auth: it exposes nothing but the build identity.
 */
export function GET() {
  return NextResponse.json({
    app: "foothold",
    version: pkg.version,
    commit: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.FLY_MACHINE_VERSION ?? null,
    builtAt: process.env.BUILD_TIME ?? null,
  });
}
