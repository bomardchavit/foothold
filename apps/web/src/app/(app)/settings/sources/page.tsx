import { formatDistanceToNowStrict } from "date-fns";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { SourcesPanel } from "@/components/settings/sources-panel";
import { env } from "@/lib/env";
import { US_COMPANIES } from "@/lib/ingest/us-companies";

export const metadata = { title: "Job sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  await requireUser();
  const sources = await prisma.jobSource.findMany({ orderBy: [{ kind: "asc" }, { slug: "asc" }], include: { _count: { select: { jobs: true } }, runs: { orderBy: { startedAt: "desc" }, take: 1 } } });
  return (
    <SourcesPanel keys={{ adzuna: Boolean(env.adzuna), usajobs: Boolean(env.usajobs) }} scheduler={{ everyMin: Number(process.env.SCRAPE_INTERVAL_MIN ?? 120), mode: env.jobsMode }} countries={process.env.JOBS_COUNTRIES ?? "US"} curatedCount={US_COMPANIES.length} sources={sources.map((s) => ({ id: s.id, kind: s.kind, slug: s.slug, name: s.name, enabled: s.enabled, jobs: s._count.jobs, lastRun: s.lastRunAt ? formatDistanceToNowStrict(s.lastRunAt, { addSuffix: true }) : null, lastStatus: s.lastStatus, lastCounts: s.runs[0] ? `${s.runs[0].fetched} fetched, ${s.runs[0].inserted} new, ${s.runs[0].updated} updated` : null }))} />
  );
}
