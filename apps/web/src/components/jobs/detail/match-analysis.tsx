import { Check, Minus, X } from "lucide-react";
import type { H1bSignal } from "@prisma/client";
import type { MatchBreakdown } from "@foothold/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type State = "ok" | "partial" | "no" | "unknown";
const stateOf = (c: MatchBreakdown["components"][number]): State => (c.status !== "scored" ? "unknown" : c.score >= 70 ? "ok" : c.score >= 45 ? "partial" : "no");

function StateIcon({ state }: { state: State }) {
  const Icon = state === "ok" ? Check : state === "no" ? X : Minus;
  return (
    <span aria-hidden className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", state === "ok" ? "bg-primary/15 text-primary-strong" : state === "no" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-strong")}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
    </span>
  );
}

/** The six scored components plus sponsorship, each as a check / partial / x headline with the evidence sentence under it. */
export function MatchAnalysis({ breakdown, h1b }: { breakdown: MatchBreakdown; h1b: { signal: H1bSignal; matchedName: string | null; approvals: number; years: number[] } }) {
  const sponsorship: { state: State; text: string } = h1b.signal === "YES"
    ? { state: "ok", text: `USCIS data shows ${h1b.matchedName ?? "this employer"} with ${h1b.approvals} H-1B approvals in FY ${h1b.years.join(", ")}.` }
    : h1b.signal === "LIKELY" ? { state: "partial", text: `A fuzzy USCIS name match (${h1b.matchedName}) had ${h1b.approvals} H-1B approvals; verify it is the same employer.` }
    : { state: "unknown", text: "No H-1B filing history found for this employer in the USCIS data." };
  return (
    <ul className="divide-y divide-border/70" data-testid="fit-legend">
      {breakdown.components.map((c) => {
        const state = stateOf(c);
        return (
          <li key={c.key} className="flex gap-3 py-3.5 first:pt-0">
            <StateIcon state={state} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold">{c.label}</p>
                <span className="shrink-0 text-[13px] tabular-nums text-muted-strong">{c.status === "na" ? "not applied" : c.status === "unknown" ? `unknown · ${c.score}` : `${c.score}/100`} · {Math.round(c.weight * 100)}% weight</span>
              </div>
              <p className="mt-0.5 text-[14px] leading-5 text-muted-foreground">{c.evidence.join(" ")}</p>
              {c.key === "skills" && (breakdown.matchedSkills.length > 0 || breakdown.missingRequired.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {breakdown.matchedSkills.slice(0, 10).map((s) => <Badge key={s} variant="default" data-testid="skill-have">{s}</Badge>)}
                  {breakdown.missingRequired.slice(0, 8).map((s) => <Badge key={s} variant="outline" className="border-dashed text-muted-foreground" data-testid="skill-missing">{s}</Badge>)}
                </div>
              )}
            </div>
          </li>
        );
      })}
      <li className="flex gap-3 py-3.5">
        <StateIcon state={sponsorship.state} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Sponsorship</p>
          <p className="mt-0.5 text-[14px] leading-5 text-muted-foreground">{sponsorship.text}</p>
        </div>
      </li>
      {(breakdown.adjustments ?? []).map((a) => (
        <li key={a.key} className="flex gap-3 py-3.5">
          <StateIcon state={a.factor >= 0.95 ? "ok" : a.factor >= 0.75 ? "partial" : "no"} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{a.key === "roleFit" ? "Title fit" : "Employment type"}</p>
            <p className="mt-0.5 text-[14px] leading-5 text-muted-foreground">{a.reason}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
