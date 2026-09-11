import { requireOnboarded } from "@/lib/session";
import { prisma } from "@/lib/db";
import { parseFeedFilters, queryFeed, newSinceLastVisit } from "@/lib/jobs/query";
import { FilterRail } from "@/components/jobs/filter-rail";
import { MatchCard } from "@/components/jobs/match-card";
import { FeedTracker } from "@/components/jobs/feed-tracker";
import { Pagination } from "@/components/jobs/pagination";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";
import { breakdownFromRow } from "@/lib/matching/service";

export const metadata = { title: "Matches" };
export const dynamic = "force-dynamic";

export default async function FeedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, profile } = await requireOnboarded();
  const filters = parseFeedFilters(await searchParams);
  const [feed, fresh, industries] = await Promise.all([
    queryFeed(profile.id, filters),
    newSinceLastVisit(profile.id, profile.lastFeedVisitAt),
    prisma.job.findMany({ where: { industry: { not: null } }, distinct: ["industry"], select: { industry: true }, orderBy: { industry: "asc" } }),
  ]);
  const totalMatches = await prisma.matchScore.count({ where: { profileId: profile.id } });
  const isDefault = filters.page === 1 && !filters.q && !filters.loc && !filters.remote && !filters.seniority.length && !filters.industry.length && !filters.salary && !filters.h1b.length && filters.min === 0 && !filters.posted;
  track(user.id, EVENTS.feed_viewed, { results: feed.count, filtered: !isDefault });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { lastFeedVisitAt: new Date() } });

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <FeedTracker waiting={totalMatches === 0} />
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <FilterRail filters={filters} industries={industries.map((i) => i.industry!).filter(Boolean)} hidden={feed.hidden} />
      </aside>
      <section className="min-w-0">
        {totalMatches === 0 && (
          <div className="mb-6 rounded-xl border border-dashed p-6 text-sm text-muted-foreground" data-testid="feed-empty">
            Matches are still being computed. Refresh in a few seconds. If this persists, run <code>npm run db:seed</code> or add a job source in Settings.
          </div>
        )}
        {isDefault && fresh.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-1 text-xl">New since your last visit</h2>
            <p className="mb-3 text-sm text-muted-foreground">{fresh.length} new roles ranked by fit.</p>
            <ul className="space-y-3">{fresh.map((m) => <MatchCard key={m.id} row={m} breakdown={breakdownFromRow(m)} fresh />)}</ul>
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl">{isDefault ? "All matches" : "Filtered matches"}</h1>
          <p className="text-sm text-muted-foreground" data-testid="feed-count">{feed.count} roles{feed.hidden > 0 ? ` · ${feed.hidden} hidden as low quality` : ""}</p>
        </div>
        {feed.rows.length === 0 ? (
          <p className="rounded-xl border p-6 text-sm text-muted-foreground">Nothing matches these filters. Loosen the fit threshold or clear a filter.</p>
        ) : (
          <ul className="space-y-3" data-testid="match-list">{feed.rows.map((m) => <MatchCard key={m.id} row={m} breakdown={breakdownFromRow(m)} />)}</ul>
        )}
        <Pagination page={filters.page} pageSize={feed.pageSize} count={feed.count} />
      </section>
    </div>
  );
}
