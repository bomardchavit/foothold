"use client";
import { useEffect } from "react";
import posthog from "posthog-js";
import type { EventName } from "@/lib/analytics/events";

let ready = false;
export function initPosthog() {
  if (ready || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com", autocapture: false, capture_pageview: true, person_profiles: "identified_only" });
  ready = true;
}
export function trackClient(event: EventName, properties: Record<string, unknown> = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) { if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event, properties); return; }
  posthog.capture(event, properties);
}
export function PostHogProvider({ userId, email, children }: { userId?: string; email?: string | null; children: React.ReactNode }) {
  useEffect(() => {
    initPosthog();
    if (ready && userId) posthog.identify(userId, email ? { email } : undefined);
  }, [userId, email]);
  return <>{children}</>;
}
