import { PostHog } from "posthog-node";
import { env } from "../env";
import type { EventName } from "./events";

let client: PostHog | null | undefined;
function getClient(): PostHog | null {
  if (client !== undefined) return client;
  client = env.posthogKey ? new PostHog(env.posthogKey, { host: env.posthogHost, flushAt: 1, flushInterval: 0 }) : null;
  return client;
}

/** Server-side capture. No-op without a key; never throws. */
export function track(userId: string, event: EventName, properties: Record<string, unknown> = {}) {
  try {
    const c = getClient();
    if (!c) { if (process.env.ANALYTICS_DEBUG) console.log("[analytics]", event, userId, properties); return; }
    c.capture({ distinctId: userId, event, properties: { ...properties, $lib: "foothold-server" } });
  } catch (e) { console.warn("[analytics] capture failed", e); }
}
export async function flushAnalytics() { try { await getClient()?.flush(); } catch { /* ignore */ } }
