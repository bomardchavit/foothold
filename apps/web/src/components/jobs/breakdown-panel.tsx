"use client";
import { useEffect } from "react";
import type { H1bSignal } from "@prisma/client";
import type { MatchBreakdown } from "@foothold/shared";
import { MatchAnalysis } from "@/components/jobs/detail/match-analysis";
import { trackClient } from "@/components/providers/posthog-provider";
import { EVENTS } from "@/lib/analytics/events";

export function BreakdownPanel({ breakdown, jobId, h1b }: { breakdown: MatchBreakdown; jobId: string; h1b: { signal: H1bSignal; matchedName: string | null; approvals: number; years: number[] } }) {
  useEffect(() => { trackClient(EVENTS.match_breakdown_opened, { jobId, total: breakdown.total }); }, [jobId, breakdown.total]);
  return (
    <div data-testid="breakdown-panel">
      <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-xl">Why this score</h2><span className="text-xs text-muted-foreground">Weights renormalize when a part does not apply.</span></div>
      <MatchAnalysis breakdown={breakdown} h1b={h1b} />
    </div>
  );
}
