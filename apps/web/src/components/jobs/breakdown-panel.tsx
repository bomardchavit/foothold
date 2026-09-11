"use client";
import { useEffect } from "react";
import type { MatchBreakdown } from "@foothold/shared";
import { FitBar, FitLegend } from "@/components/fit/fit-bar";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";

export function BreakdownPanel({ breakdown, jobId }: { breakdown: MatchBreakdown; jobId: string }) {
  useEffect(() => { trackClient(EVENTS.match_breakdown_opened, { jobId, total: breakdown.total }); }, [jobId, breakdown.total]);
  return (
    <div data-testid="breakdown-panel">
      <div className="mb-4 flex items-baseline justify-between"><h2 className="text-xl">Why this score</h2><span className="text-xs text-muted-foreground">weights renormalize when a component does not apply</span></div>
      <FitBar breakdown={breakdown} size="lg" />
      <div className="mt-5"><FitLegend breakdown={breakdown} /></div>
    </div>
  );
}
