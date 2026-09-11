import { SENIORITY_LABELS, type MatchBreakdown, type SeniorityKey } from "@foothold/shared";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface P { skills: string[]; seniority: SeniorityKey; years: number; industries: string[]; locations: string[]; remotePref: string }
interface J { required: string[]; preferred: string[]; seniority: SeniorityKey; yearsMin: number | null; yearsMax: number | null; industry: string | null; location: string | null; isRemote: boolean }

export function ComparisonTable({ profile, job, breakdown }: { profile: P; job: J; breakdown: MatchBreakdown }) {
  const have = new Set(breakdown.matchedSkills.map((s) => s.toLowerCase()));
  const chip = (s: string, ok: boolean) => <Badge key={s} variant={ok ? "default" : "outline"} className={ok ? "" : "border-dashed text-muted-foreground"} data-testid={ok ? "skill-have" : "skill-missing"}>{s}</Badge>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader><TableRow><TableHead className="w-36">Dimension</TableHead><TableHead>You</TableHead><TableHead>The role asks for</TableHead></TableRow></TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="align-top font-medium">Required skills</TableCell>
            <TableCell className="align-top"><div className="flex flex-wrap gap-1">{job.required.filter((s) => have.has(s.toLowerCase())).map((s) => chip(s, true))}{breakdown.missingRequired.length > 0 && <span className="text-xs text-muted-foreground">Missing: {breakdown.missingRequired.join(", ")}</span>}</div></TableCell>
            <TableCell className="align-top"><div className="flex flex-wrap gap-1">{job.required.map((s) => chip(s, have.has(s.toLowerCase())))}</div></TableCell>
          </TableRow>
          {job.preferred.length > 0 && (
            <TableRow>
              <TableCell className="align-top font-medium">Preferred skills</TableCell>
              <TableCell className="align-top"><div className="flex flex-wrap gap-1">{job.preferred.filter((s) => have.has(s.toLowerCase())).map((s) => chip(s, true))}</div></TableCell>
              <TableCell className="align-top"><div className="flex flex-wrap gap-1">{job.preferred.map((s) => chip(s, have.has(s.toLowerCase())))}</div></TableCell>
            </TableRow>
          )}
          <TableRow><TableCell className="font-medium">Seniority</TableCell><TableCell>{SENIORITY_LABELS[profile.seniority]}</TableCell><TableCell>{SENIORITY_LABELS[job.seniority]}</TableCell></TableRow>
          <TableRow><TableCell className="font-medium">Years</TableCell><TableCell>{profile.years.toFixed(1)}</TableCell><TableCell>{job.yearsMin == null && job.yearsMax == null ? "Not stated" : `${job.yearsMin ?? 0}${job.yearsMax != null ? `–${job.yearsMax}` : "+"}`}</TableCell></TableRow>
          <TableRow><TableCell className="font-medium">Industry</TableCell><TableCell>{profile.industries.length ? profile.industries.join(", ") : "Any"}</TableCell><TableCell>{job.industry ?? "Unknown"}</TableCell></TableRow>
          <TableRow><TableCell className="font-medium">Location</TableCell><TableCell>{profile.locations.length ? profile.locations.join(", ") : "Anywhere"} · {profile.remotePref.toLowerCase()}</TableCell><TableCell>{job.location ?? "Unknown"}{job.isRemote ? " · remote" : ""}</TableCell></TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
