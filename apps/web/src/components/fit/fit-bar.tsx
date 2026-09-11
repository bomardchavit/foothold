"use client";
import type { MatchBreakdown, ComponentKey } from "@foothold/shared";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const COMPONENT_COLORS: Record<ComponentKey, string> = {
  skills: "bg-primary", semantic: "bg-slate", seniority: "bg-ochre", years: "bg-plum", industry: "bg-ink-soft", location: "bg-chart-5",
};

/** Segmented fit bar: one segment per scored component, width ∝ weight, fill ∝ score. Never shows a bare number without its parts. */
export function FitBar({ breakdown, size = "md", showTotal = true, className }: { breakdown: MatchBreakdown; size?: "sm" | "md" | "lg"; showTotal?: boolean; className?: string }) {
  const applied = breakdown.components.filter((c) => c.status !== "na");
  const h = size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2";
  return (
    <div className={cn("flex items-center gap-3", className)} data-testid="fit-bar">
      <div className={cn("flex w-full gap-0.5 overflow-hidden rounded-full bg-muted", h)} role="img" aria-label={`Fit ${breakdown.total} of 100: ${applied.map((c) => `${c.label} ${c.score}`).join(", ")}`}>
        {applied.map((c) => (
          <Tooltip key={c.key}>
            <TooltipTrigger asChild>
              <div className="relative h-full bg-muted-foreground/15" style={{ flexGrow: c.weight, flexBasis: 0 }}>
                <div className={cn("h-full", COMPONENT_COLORS[c.key], c.status === "unknown" && "opacity-40")} style={{ width: `${c.score}%` }} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <span className="font-medium">{c.label}</span>: {c.status === "unknown" ? `unknown (scored ${c.score})` : `${c.score}/100`} · weight {Math.round(c.weight * 100)}%
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {showTotal && <span className={cn("shrink-0 tabular-nums font-medium", size === "lg" ? "text-2xl" : "text-sm")} data-testid="fit-total">{breakdown.total}<span className="text-muted-foreground"> fit</span></span>}
    </div>
  );
}

export function FitLegend({ breakdown }: { breakdown: MatchBreakdown }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-testid="fit-legend">
      {breakdown.components.map((c) => (
        <li key={c.key} className="flex items-start gap-2 text-sm">
          <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm", COMPONENT_COLORS[c.key], c.status !== "scored" && "opacity-40")} />
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{c.label}</span>
              <span className="tabular-nums text-muted-foreground">{c.status === "na" ? "not applied" : c.status === "unknown" ? `unknown · ${c.score}` : c.score}</span>
            </div>
            <ul className="text-muted-foreground">{c.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
