import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { parseFeedFilters, queryFeed, tabCounts, connectionCounts, isDefaultFilters } from "@/lib/jobs/query";
import { breakdownFromRow } from "@/lib/matching/service";
import { listIndustries } from "@/lib/jobs/industries";
import { companyHasLogo } from "@/lib/jobs/logo";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";
import { JobsHeader } from "@/components/jobs/workspace/jobs-header";
import { FilterBar } from "@/components/jobs/workspace/filter-bar";
import { JobCard, type CardData } from "@/components/jobs/workspace/job-card";
import { RightRail } from "@/components/jobs/workspace/right-rail";
import { Pagination } from "@/components/jobs/pagination";
import { FeedTracker } from "@/components/jobs/feed-tracker";
import { EmptyState } from "@/components/jobs/workspace/empty-state";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, profile } = await requireOnboarded();
  const sp = await searchParams;
  // saved filter → expand into params
  let params = sp;
  const sfId = Array.isArray(sp.sf) ? sp.sf[0] : sp.sf;
  if (sfId) {
    const sf = await prisma.savedFilter.findFirst({ where: { id: sfId, userId: user.id } });
    if (sf) params = { ...(sf.paramsJson as Record<string, string>), ...sp };
  }
  const filters = parseFeedFilters(params);
  const [feed, counts, industries, savedFilters, totalMatches] = await Promise.all([
    queryFeed(profile.id, user.id, filters),
    tabCounts(profile.id, user.id),
    listIndustries(),
    prisma.savedFilter.findMany({ where: { userId: user.id }, orderBy: { order: "asc" } }),
    prisma.matchScore.count({ where: { profileId: profile.id } }),
  ]);
  const conn = await connectionCounts(user.id, [...new Set(feed.rows.map((r) => r.job.company.normalizedName))]);
  const appRows = await prisma.application.findMany({ where: { userId: user.id, jobId: { in: feed.rows.map((r) => r.jobId) } }, select: { jobId: true, status: true } });
  const appByJob = new Map(appRows.map((a) => [a.jobId, a.status]));
  track(user.id, EVENTS.feed_viewed, { results: feed.count, filtered: !isDefaultFilters(filters), tab: filters.tab });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { lastFeedVisitAt: new Date() } });

  const cards: CardData[] = feed.rows.map((r) => {
    const c = conn.get(r.job.company.normalizedName);
    return {
      jobId: r.jobId, title: r.job.title, company: r.job.company.name, companyId: r.job.companyId, hasLogo: companyHasLogo(r.job.company), industry: r.job.industry ?? r.job.company.industry, companySize: r.job.company.size,
      location: r.job.location, extraLocations: extraLocationsOf(r.job.rawJson, r.job.location), city: r.job.city, region: r.job.region, isRemote: r.job.isRemote, workplaceType: r.job.workplaceType, employmentType: r.job.employmentType, seniority: r.job.seniority,
      salaryMin: r.job.salaryMin, salaryMax: r.job.salaryMax, salaryCurrency: r.job.salaryCurrency, salaryPeriod: r.job.salaryPeriod, postedAt: r.job.postedAt?.toISOString() ?? null,
      applyUrl: r.job.applyUrl, qualityFlags: r.job.qualityFlags, h1b: { signal: r.job.company.h1bSignal, matchedName: r.job.company.h1bMatchedName, approvals: r.job.company.h1bApprovals, years: r.job.company.h1bYears },
      alumni: c?.alumni ?? 0, connections: c?.connections ?? 0, breakdown: breakdownFromRow(r), applicationStatus: appByJob.get(r.jobId) ?? null, hidden: filters.hidden, sourceKind: r.job.source.kind,
    };
  });

  return (
    <div className="flex">
      <FeedTracker waiting={totalMatches === 0} />
      <div className="min-w-0 flex-1">
        <JobsHeader tab={filters.tab} counts={counts} q={filters.q} />
        <FilterBar filters={filters} industries={industries} targetRoles={profile.targetRoles} hiddenCount={counts.hidden} lowQualityHidden={feed.hidden} />
        <div className="mt-4 max-w-[980px] space-y-4 px-4 sm:mt-5 sm:px-6" data-testid="match-list">
          {cards.length === 0 ? <EmptyState tab={filters.tab} hidden={filters.hidden} filtered={!isDefaultFilters(filters)} computing={totalMatches === 0} /> : cards.map((c) => <JobCard key={c.jobId} data={c} />)}
        </div>
        <div className="max-w-[980px] px-4 sm:px-6"><Pagination page={filters.page} pageSize={feed.pageSize} count={feed.count} /></div>
        <p className="mt-6 max-w-[980px] px-4 text-xs text-muted-foreground sm:px-6" data-testid="feed-count">{feed.count} roles{feed.hidden > 0 ? ` · ${feed.hidden} hidden as low quality` : ""}</p>
      </div>
      <RightRail user={{ name: user.name, email: user.email, image: user.image }} savedFilters={savedFilters.map((s) => ({ id: s.id, name: s.name, params: s.paramsJson as Record<string, string> }))} currentParams={params as Record<string, string | string[] | undefined>} activeId={sfId ?? null} />
    </div>
  );
}

function extraLocationsOf(raw: unknown, location: string | null): number {
  const offices = (raw as { offices?: Array<{ name: string }> } | null)?.offices;
  if (Array.isArray(offices) && offices.length > 1) return offices.length - 1;
  const parts = (location ?? "").split(/\s*(?:·|;|\|)\s*/).filter(Boolean);
  return Math.max(0, parts.length - 1);
}
