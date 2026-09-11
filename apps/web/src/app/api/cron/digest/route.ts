import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { dailyDigestJob } from "@/lib/digest/send";

/**
 * Trigger the daily digest from an external scheduler:
 * `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/digest`
 * POST only. In production the route refuses to run until CRON_SECRET is set, so a missing variable can never
 * fall back to a public default; locally the dev default from env.ts still works.
 */
export const maxDuration = 300;

function secretMatches(header: string, secret: string): boolean {
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request) {
  const configured = process.env.CRON_SECRET;
  if (env.isProd && !configured) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!secretMatches(req.headers.get("authorization") ?? "", configured || env.cronSecret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sent = await dailyDigestJob();
  return Response.json({ sent });
}
