import { Check, Minus, X } from "lucide-react";
import type { H1bSignal } from "@prisma/client";
import type { ComponentKey, MatchBreakdown } from "@foothold/shared";
import { cn } from "@/lib/utils";

/** Shared fit vocabulary for the job card's score panel and the job page's score card: one ring, one label scale, one row set. */

export type FitState = "ok" | "no" | "unknown";
export interface FitSignal { key: string; state: FitState; text: string; testId?: string }

export function fitLabel(total: number): string {
  return total >= 75 ? "Strong match" : total >= 55 ? "Good match" : "Fair match";
}

/** Four fixed rows (sponsorship, compensation, level, location) plus alumni when present, each with an explicit ok / not-ok / unknown state. */
export function fitSignals(input: { h1b: H1bSignal; hasSalary: boolean; alumni: number; breakdown: MatchBreakdown }): FitSignal[] {
  const component = (key: ComponentKey) => input.breakdown.components.find((c) => c.key === key);
  const graded = (key: ComponentKey, ok: string, no: string, unknown: string): { state: FitState; text: string } => {
    const c = component(key);
    if (!c || c.status !== "scored") return { state: "unknown", text: unknown };
    return c.score >= 60 ? { state: "ok", text: ok } : { state: "no", text: no };
  };
  const h1b: FitSignal = input.h1b === "YES" ? { key: "h1b", state: "ok", text: "H1B sponsor", testId: "h1b-badge" }
    : input.h1b === "LIKELY" ? { key: "h1b", state: "ok", text: "H1B sponsor likely", testId: "h1b-badge" }
    : { key: "h1b", state: "unknown", text: "H1B unknown", testId: "h1b-badge" };
  const out: FitSignal[] = [
    h1b,
    { key: "comp", ...(input.hasSalary ? { state: "ok" as const, text: "Comp. & benefits" } : { state: "no" as const, text: "Comp. not listed" }) },
    { key: "level", ...graded("seniority", "Level fit", "Level mismatch", "Level not stated") },
    { key: "location", ...graded("location", "Location fit", "Location mismatch", "Location unclear") },
  ];
  if (input.alumni > 0) out.push({ key: "alumni", state: "ok", text: `${input.alumni} alumni inside` });
  return out;
}

/** Percent ring. Size comes from the className (e.g. `h-14 w-14 md:h-20 md:w-20`); the number scales with it. */
export function FitRing({ total, className, tone = "dark" }: { total: number; className?: string; tone?: "dark" | "light" }) {
  const r = 34, c = 2 * Math.PI * r, dash = (total / 100) * c;
  return (
    <svg viewBox="0 0 80 80" className={cn("shrink-0", className)} role="img" aria-label={`${total} percent fit`}>
      <g transform="rotate(-90 40 40)">
        <circle cx="40" cy="40" r={r} fill="none" stroke={tone === "dark" ? "rgba(255,255,255,0.14)" : "var(--muted)"} strokeWidth="5" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={tone === "dark" ? "oklch(0.8 0.15 48)" : "var(--primary)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} className="transition-[stroke-dasharray] duration-700" />
      </g>
      <text x="41" y="41" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="23" fontWeight="700" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="fit-total">{total}<tspan fontSize="11" fontWeight="500">%</tspan></text>
    </svg>
  );
}

export function FitSignalList({ signals, tone = "dark", className }: { signals: FitSignal[]; tone?: "dark" | "light"; className?: string }) {
  const okColor = tone === "dark" ? "text-[oklch(0.82_0.14_48)]" : "text-primary";
  const dim = tone === "dark" ? "text-white/75" : "text-muted-foreground";
  return (
    <ul className={cn("text-left text-[12px] leading-4", className)}>
      {signals.map((s) => {
        const Icon = s.state === "ok" ? Check : s.state === "no" ? X : Minus;
        return (
          <li key={s.key} data-testid={s.testId} className={cn("flex items-start gap-1.5", s.state !== "ok" && dim)}>
            <Icon aria-hidden className={cn("mt-px h-3.5 w-3.5 shrink-0", s.state === "ok" && okColor)} strokeWidth={2.5} />
            <span className="min-w-0">{s.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
