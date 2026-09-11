import { SENIORITY_LABELS, type MatchBreakdown, type SeniorityKey } from "@foothold/shared";
import { Badge } from "@/components/ui/badge";

interface P { skills: string[]; seniority: SeniorityKey; years: number; industries: string[]; locations: string[]; remotePref: string }
interface J { required: string[]; preferred: string[]; seniority: SeniorityKey; yearsMin: number | null; yearsMax: number | null; industry: string | null; location: string | null; isRemote: boolean }

/** You vs. the posting, one dimension per row. Two columns side by side from md up, stacked (You, then The role) below. */
export function ComparisonTable({ profile, job, breakdown }: { profile: P; job: J; breakdown: MatchBreakdown }) {
  const have = new Set(breakdown.matchedSkills.map((s) => s.toLowerCase()));
  const chip = (s: string, ok: boolean) => <Badge key={s} variant={ok ? "default" : "outline"} className={ok ? "" : "border-dashed text-muted-foreground"} data-testid={ok ? "skill-have" : "skill-missing"}>{s}</Badge>;
  const chips = (list: React.ReactNode[]) => (list.length ? <div className="flex flex-wrap gap-1">{list}</div> : <span className="text-muted-foreground">None</span>);
  const rows: Array<{ label: string; you: React.ReactNode; role: React.ReactNode }> = [
    { label: "Required skills", you: chips(job.required.filter((s) => have.has(s.toLowerCase())).map((s) => chip(s, true))), role: chips(job.required.map((s) => chip(s, have.has(s.toLowerCase())))) },
    ...(job.preferred.length ? [{ label: "Preferred skills", you: chips(job.preferred.filter((s) => have.has(s.toLowerCase())).map((s) => chip(s, true))), role: chips(job.preferred.map((s) => chip(s, have.has(s.toLowerCase())))) }] : []),
    { label: "Level", you: SENIORITY_LABELS[profile.seniority], role: SENIORITY_LABELS[job.seniority] },
    { label: "Years", you: profile.years.toFixed(1), role: job.yearsMin == null && job.yearsMax == null ? "Not stated" : `${job.yearsMin ?? 0}${job.yearsMax != null ? `–${job.yearsMax}` : "+"}` },
    { label: "Industry", you: profile.industries.length ? profile.industries.join(", ") : "Any", role: job.industry ?? "Not stated" },
    { label: "Location", you: `${profile.locations.length ? profile.locations.join(", ") : "Anywhere"} · ${profile.remotePref.toLowerCase()}`, role: `${job.location ?? "Not stated"}${job.isRemote ? " · remote" : ""}` },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card text-[14px]">
      <div className="hidden grid-cols-[140px_1fr_1fr] gap-4 border-b border-border/70 bg-muted/40 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-muted-strong md:grid"><span>Dimension</span><span>You</span><span>The role asks for</span></div>
      <ul className="divide-y divide-border/70">
        {rows.map((r) => (
          <li key={r.label} className="grid gap-2 px-4 py-3 md:grid-cols-[140px_1fr_1fr] md:gap-4">
            <span className="font-medium">{r.label}</span>
            <div><span className="mr-2 text-[12px] font-semibold uppercase tracking-wider text-muted-strong md:hidden">You</span>{r.you}</div>
            <div><span className="mr-2 text-[12px] font-semibold uppercase tracking-wider text-muted-strong md:hidden">Role</span>{r.role}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
