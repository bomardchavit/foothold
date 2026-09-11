"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCopilot } from "@/components/copilot/copilot-context";

/** Clears the copilot job context on the feed and polls while matches are still being computed. */
export function FeedTracker({ waiting = false }: { waiting?: boolean }) {
  const c = useCopilot();
  const router = useRouter();
  useEffect(() => { c.setJob(null); }, [c]);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [waiting, router]);
  return null;
}
