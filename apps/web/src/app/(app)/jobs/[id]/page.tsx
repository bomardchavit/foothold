import { notFound } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { SENIORITY_LABELS } from "@foothold/shared";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { breakdownFromRow, computeBreakdown, upsertMatches } from "@/lib/matching/service";
import { cosineForJobs } from "@/lib/vectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { H1bBadge, QualityBadges, salaryLabel } from "@/components/jobs/badges";
import { BreakdownPanel } from "@/components/jobs/breakdown-panel";
import { JobPageClient } from "@/components/jobs/job-page-client";
import { ComparisonTable } from "@/components/jobs/comparison-table";
import { JobActions } from "@/components/jobs/job-actions";
import { KeywordGapsPanel } from "@/components/jobs/keyword-gaps-panel";
import { InsidersPanel } from "@/components/network/insiders-panel";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireOnboarded();
  const job = await prisma.job.findUnique({ where: { id }, include: { company: true } });
  if (!job) notFound();
  let match = await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId: job.id } } });
  if (!match || match.profileVersion !== profile.version) {
    const cos = (await cosineForJobs(profile.id, [job.id])).get(job.id) ?? null;
    const breakdown = computeBreakdown(profile, job, cos);
    await upsertMatches(profile, [{ jobId: job.id, breakdown }]);
    match = (await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId: job.id } } }))!;
  }
  const breakdown = breakdownFromRow(match);
  const application = await prisma.application.findUnique({ where: { userId_jobId: { userId: profile.userId, jobId: job.id } }, select: { id: true, status: true } });
  const salary = salaryLabel(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);

  return (
    <div className="grid gap-8 px-4 pt-6 sm:px-6 lg:grid-cols-[1fr_380px]">
      <JobPageClient job={{ id: job.id, title: job.title, company: job.company.name }} />
      <article className="min-w-0">
        <header>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{job.company.name}</span>{job.company.industry && <span>· {job.company.industry}</span>}
            {job.postedAt && <span>· posted {formatDistanceToNowStrict(job.postedAt, { addSuffix: true })}</span>}
            <span>· via {await sourceLabel(job.sourceId)}</span>
          </div>
          <h1 className="mt-1 text-3xl" data-testid="job-title">{job.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {job.location && <Badge variant="outline">{job.location}</Badge>}
            {job.isRemote && <Badge variant="outline">Remote</Badge>}
            {job.seniority !== "UNKNOWN" && <Badge variant="outline">{SENIORITY_LABELS[job.seniority]}</Badge>}
            {(job.yearsMin != null || job.yearsMax != null) && <Badge variant="outline">{job.yearsMin ?? 0}{job.yearsMax != null ? `–${job.yearsMax}` : "+"} yrs</Badge>}
            {salary && <Badge variant="outline">{salary}</Badge>}
            <H1bBadge signal={job.company.h1bSignal} matchedName={job.company.h1bMatchedName} approvals={job.company.h1bApprovals} years={job.company.h1bYears} />
            <QualityBadges flags={job.qualityFlags} />
          </div>
        </header>
        <div className="mt-6 rounded-xl border bg-card p-5">
          <BreakdownPanel breakdown={breakdown} jobId={job.id} />
        </div>
        <section className="mt-6">
          <h2 className="mb-3 text-xl">You vs. the requirements</h2>
          <ComparisonTable profile={{ skills: profile.skills.map((s) => s.name), seniority: profile.seniority, years: profile.yearsExperience, industries: profile.industries, locations: profile.locations, remotePref: profile.remotePref }}
            job={{ required: job.requiredSkills, preferred: job.preferredSkills, seniority: job.seniority, yearsMin: job.yearsMin, yearsMax: job.yearsMax, industry: job.industry ?? job.company.industry, location: job.location, isRemote: job.isRemote }} breakdown={breakdown} />
        </section>
        <section className="mt-6">
          <h2 className="mb-3 text-xl">Keyword gaps</h2>
          <KeywordGapsPanel jobId={job.id} />
        </section>
        <section className="mt-8">
          <h2 className="mb-3 text-xl">Posting</h2>
          <div className="whitespace-pre-wrap rounded-xl border bg-card p-5 text-sm leading-relaxed" data-testid="job-description">{job.description}</div>
          <p className="mt-2 text-xs text-muted-foreground">Apply on the employer&apos;s site: <a className="underline" href={job.applyUrl} target="_blank" rel="noopener noreferrer">{job.applyUrl}</a></p>
        </section>
      </article>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <JobActions job={{ id: job.id, title: job.title, company: job.company.name, applyUrl: job.applyUrl }} application={application} />
        <InsidersPanel companyId={job.company.id} companyName={job.company.name} jobId={job.id} />
        <Button asChild variant="ghost" className="w-full"><a href="/jobs">Back to jobs</a></Button>
      </aside>
    </div>
  );
}

async function sourceLabel(sourceId: string) {
  const s = await prisma.jobSource.findUnique({ where: { id: sourceId }, select: { kind: true, name: true, slug: true } });
  if (!s) return "unknown source";
  return s.kind === "SEED" ? "seed dataset" : `${s.kind.toLowerCase()} (${s.name ?? s.slug})`;
}
