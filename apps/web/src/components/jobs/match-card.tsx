import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import type { MatchBreakdown } from "@foothold/shared";
import { SENIORITY_LABELS } from "@foothold/shared";
import type { MatchRow } from "@/lib/jobs/query";
import { FitBar } from "@/components/fit/fit-bar";
import { Badge } from "@/components/ui/badge";
import { H1bBadge, QualityBadges, salaryLabel } from "./badges";
import { cn } from "@/lib/utils";

export function MatchCard({ row, breakdown, fresh }: { row: MatchRow; breakdown: MatchBreakdown; fresh?: boolean }) {
  const job = row.job;
  const salary = salaryLabel(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const skills = breakdown.components.find((c) => c.key === "skills");
  return (
    <li className={cn("rounded-xl border bg-card p-4 transition-shadow hover:shadow-md", fresh && "border-primary/40")} data-testid="match-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/jobs/${job.id}`} className="font-medium hover:underline" data-testid="match-title">{job.title}</Link>
          <p className="text-sm text-muted-foreground">
            {job.company.name}{job.location ? ` · ${job.location}` : ""}{job.isRemote ? " · Remote" : ""}
            {job.postedAt ? ` · ${formatDistanceToNowStrict(job.postedAt, { addSuffix: true })}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {job.seniority !== "UNKNOWN" && <Badge variant="outline">{SENIORITY_LABELS[job.seniority]}</Badge>}
          {salary && <Badge variant="outline">{salary}</Badge>}
          <H1bBadge signal={job.company.h1bSignal} matchedName={job.company.h1bMatchedName} approvals={job.company.h1bApprovals} years={job.company.h1bYears} />
          <QualityBadges flags={job.qualityFlags} />
        </div>
      </div>
      <div className="mt-3"><FitBar breakdown={breakdown} size="sm" /></div>
      {skills && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {skills.evidence.slice(1, 3).join(" ")}
        </p>
      )}
    </li>
  );
}
