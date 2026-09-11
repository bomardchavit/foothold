import type { H1bSignal } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { QUALITY_FLAG_LABELS } from "@/lib/ingest/quality";

export function H1bBadge({ signal, matchedName, approvals, years }: { signal: H1bSignal; matchedName: string | null; approvals: number; years: number[] }) {
  if (signal === "UNKNOWN") return <Badge variant="outline" className="text-muted-foreground">H-1B: unknown</Badge>;
  return (
    <Tooltip>
      <TooltipTrigger asChild><Badge variant={signal === "YES" ? "default" : "secondary"} data-testid="h1b-badge">H-1B: {signal === "YES" ? "sponsors" : "likely"}</Badge></TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">USCIS Employer Data Hub: {matchedName} had {approvals} H-1B approvals in FY {years.join(", ")}. {signal === "LIKELY" && "Matched by fuzzy name; verify the employer."}</TooltipContent>
    </Tooltip>
  );
}

export function QualityBadges({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => <Badge key={f} variant="destructive" className="font-normal" data-testid="quality-flag">{QUALITY_FLAG_LABELS[f] ?? f}</Badge>)}
    </span>
  );
}

export function salaryLabel(min: number | null, max: number | null, currency: string | null, period: string | null): string | null {
  if (min == null && max == null) return null;
  const f = (n: number) => (period === "hour" ? `$${n}` : `$${Math.round(n / 1000)}k`);
  const cur = currency && currency !== "USD" ? ` ${currency}` : "";
  const range = min != null && max != null ? `${f(min)}–${f(max)}` : f((min ?? max)!);
  return `${range}${cur}${period === "hour" ? "/hr" : period === "month" ? "/mo" : ""}`;
}
