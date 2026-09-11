import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, MapPin, Briefcase, DollarSign, GraduationCap, Building2, Clock } from "lucide-react";
import { SENIORITY_LABELS, EMPLOYMENT_TYPE_LABELS, WORKPLACE_TYPE_LABELS, COMPANY_SIZE_LABELS } from "@foothold/shared";
import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { breakdownFromRow, computeBreakdown, upsertMatches } from "@/lib/matching/service";
import { cosineForJobs } from "@/lib/vectors";
import { connectionCounts } from "@/lib/jobs/query";
import { companyHasLogo } from "@/lib/jobs/logo";
import { fitSignals } from "@/components/fit/fit-ring";
import { QualityBadges, salaryLabel } from "@/components/jobs/badges";
import { BreakdownPanel } from "@/components/jobs/breakdown-panel";
import { JobPageClient } from "@/components/jobs/job-page-client";
import { ComparisonTable } from "@/components/jobs/comparison-table";
import { KeywordGapsPanel } from "@/components/jobs/keyword-gaps-panel";
import { CompanyLogo } from "@/components/jobs/workspace/company-logo";
import { JobScoreCard } from "@/components/jobs/detail/job-score-card";
import { CompanyCard } from "@/components/jobs/detail/company-card";
import { SimilarRoles } from "@/components/jobs/detail/similar-roles";
import { PostingBody } from "@/components/jobs/detail/posting-body";
import { InsidersPanel } from "@/components/network/insiders-panel";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireOnboarded();
  const job = await prisma.job.findUnique({ where: { id }, include: { company: true, source: { select: { kind: true, name: true, slug: true } } } });
  if (!job) notFound();
  let match = await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId: job.id } } });
  if (!match || match.profileVersion !== profile.version) {
    const cos = (await cosineForJobs(profile.id, [job.id])).get(job.id) ?? null;
    const breakdown = computeBreakdown(profile, job, cos);
    await upsertMatches(profile, [{ jobId: job.id, breakdown }]);
    match = (await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId: job.id } } }))!;
  }
  const breakdown = breakdownFromRow(match);
  const [application, hidden, conns] = await Promise.all([
    prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId: job.id } }, select: { id: true, status: true } }),
    prisma.hiddenJob.findFirst({ where: { userId: user.id, jobId: job.id }, select: { id: true } }),
    connectionCounts(user.id, [job.company.normalizedName]),
  ]);
  const c = conns.get(job.company.normalizedName);
  const alumni = c?.alumni ?? 0;
  const salary = salaryLabel(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryPeriod);
  const posted = job.postedAt ? formatDistanceToNowStrict(job.postedAt, { addSuffix: true }) : null;
  const workplace = job.workplaceType === "UNKNOWN" ? (job.isRemote ? "REMOTE" : "ONSITE") : job.workplaceType;
  const h1b = { signal: job.company.h1bSignal, matchedName: job.company.h1bMatchedName, approvals: job.company.h1bApprovals, years: job.company.h1bYears };
  const signals = fitSignals({ h1b: job.company.h1bSignal, hasSalary: Boolean(job.salaryMin || job.salaryMax), alumni, breakdown });
  const source = job.source.kind === "SEED" ? "seed dataset" : job.source.kind === "MANUAL" ? "tracked by you" : `${job.source.kind.toLowerCase()} · ${job.source.name ?? job.source.slug}`;
  const meta: Array<{ icon: typeof MapPin; text: string; muted?: boolean }> = [
    { icon: MapPin, text: job.location ?? (job.isRemote ? "Remote" : "Location not stated"), muted: !job.location && !job.isRemote },
    { icon: Briefcase, text: job.employmentType === "UNKNOWN" ? "Type not stated" : EMPLOYMENT_TYPE_LABELS[job.employmentType], muted: job.employmentType === "UNKNOWN" },
    { icon: DollarSign, text: salary ?? "Compensation not listed", muted: !salary },
    { icon: GraduationCap, text: `${job.seniority === "UNKNOWN" ? "Level not stated" : SENIORITY_LABELS[job.seniority]}${job.yearsMin != null || job.yearsMax != null ? ` · ${job.yearsMin ?? 0}${job.yearsMax != null ? `–${job.yearsMax}` : "+"} yrs` : ""}`, muted: job.seniority === "UNKNOWN" },
    { icon: Building2, text: WORKPLACE_TYPE_LABELS[workplace] },
    { icon: Clock, text: posted ? `Posted ${posted}` : `Seen ${formatDistanceToNowStrict(job.firstSeenAt, { addSuffix: true })}` },
  ];

  return (
    <div className="px-4 pt-5 sm:px-6">
      <JobPageClient job={{ id: job.id, title: job.title, company: job.company.name }} />
      <div className="mx-auto grid max-w-[1180px] gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
        <header className="min-w-0">
          <Link href="/jobs" className="focus-ring inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted-strong hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Jobs</Link>
          <div className="mt-3 flex gap-4">
            <CompanyLogo companyId={job.company.id} name={job.company.name} hasLogo={companyHasLogo(job.company)} className="h-16 w-16 text-[22px] sm:h-20 sm:w-20 sm:text-[26px]" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] leading-5">
                {alumni > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-strong">{alumni} school alumni</span>}
                {alumni === 0 && (c?.connections ?? 0) > 0 && <span className="rounded-md bg-muted px-2 py-0.5 text-muted-strong">{c!.connections} connection{c!.connections === 1 ? "" : "s"}</span>}
                {job.closedAt && <span className="rounded-md bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">No longer listed</span>}
                <QualityBadges flags={job.qualityFlags} />
              </div>
              <h1 className="mt-1 text-[24px] leading-tight sm:text-[28px]" data-testid="job-title">{job.title}</h1>
              <p className="mt-1 text-[15px] text-muted-foreground"><span className="font-medium text-foreground">{job.company.name}</span>{job.company.industry && <> <span aria-hidden className="text-muted-foreground/70">/</span> {job.company.industry}</>}{job.company.size && <> · {COMPANY_SIZE_LABELS[job.company.size]}</>}</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px]" aria-label="Role details">
            {meta.map((m, i) => <li key={i} className={`flex items-center gap-1.5 ${m.muted ? "text-muted-foreground" : ""}`}><m.icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />{m.text}</li>)}
          </ul>
        </header>
        <aside className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-6 lg:self-start">
          <JobScoreCard job={{ id: job.id, title: job.title, company: job.company.name, applyUrl: job.applyUrl }} total={breakdown.total} signals={signals} application={application} hidden={Boolean(hidden)} />
          <CompanyCard company={job.company} />
          <InsidersPanel companyId={job.company.id} companyName={job.company.name} jobId={job.id} />
        </aside>
        <article className="min-w-0 space-y-8 lg:col-start-1">
          <section className="rounded-2xl border border-border/80 bg-card p-5"><BreakdownPanel breakdown={breakdown} jobId={job.id} h1b={h1b} /></section>
          <section>
            <h2 className="mb-3 text-xl">You vs. the requirements</h2>
            <ComparisonTable profile={{ skills: profile.skills.map((s) => s.name), seniority: profile.seniority, years: profile.yearsExperience, industries: profile.industries, locations: profile.locations, remotePref: profile.remotePref }}
              job={{ required: job.requiredSkills, preferred: job.preferredSkills, seniority: job.seniority, yearsMin: job.yearsMin, yearsMax: job.yearsMax, industry: job.industry ?? job.company.industry, location: job.location, isRemote: job.isRemote }} breakdown={breakdown} />
          </section>
          <section>
            <h2 className="mb-3 text-xl">Keyword gaps</h2>
            <KeywordGapsPanel jobId={job.id} />
          </section>
          <SimilarRoles profileId={profile.id} userId={user.id} job={{ id: job.id, normalizedTitle: job.normalizedTitle }} />
          <section>
            <h2 className="mb-3 text-xl">Posting</h2>
            <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6"><PostingBody text={job.description} /></div>
            <p className="mt-2 text-xs text-muted-foreground">Source: {source}. Apply on the employer&apos;s site: <a className="underline" href={job.applyUrl} target="_blank" rel="noopener noreferrer">{job.applyUrl}</a></p>
          </section>
        </article>
      </div>
    </div>
  );
}
