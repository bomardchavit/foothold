import type { CompanySize, JobSource, JobSourceKind } from "@prisma/client";
import { hammingDistance, parseLocation, industryForDomain, sizeForDomain, type NormalizedJob } from "@foothold/shared";
import { prisma } from "../db";
import { ADAPTERS, type IndexEntry } from "./sources";
import { upsertNormalizedJob, retireJobs, inScope, mergeLocations } from "./normalize";
import { markCrossCompanyDuplicates, refreshStaleFlags } from "./quality";
import { enqueue } from "../queue";
import { resolveMissingLogos } from "../logos/resolve";

const COUNTRIES = process.env.JOBS_COUNTRIES ?? "US";
/** Careers crawls are best-effort (a hub that fails to render one run hides its postings), so they get a grace period before postings are retired. */
const EXPIRE_GRACE_MS: Partial<Record<JobSourceKind, number>> = { CAREERS: 2 * 86400_000 };

/** Above this many changed postings, one full-board fetch beats fetching them one at a time. */
const SINGLE_FETCH_LIMIT = 25;

/**
 * One pass over a source. Adapters that implement `poll` are asked what changed first: an unchanged board answers 304
 * and costs one small request, and a changed board tells us exactly which postings to fetch. Everything else falls back
 * to fetching the whole board, which is what every adapter did before.
 */
export async function ingestSourceJob({ sourceId, force = false }: { sourceId: string; force?: boolean }) {
  const source = await prisma.jobSource.findUnique({ where: { id: sourceId } });
  if (!source || !source.enabled) return;
  const adapter = ADAPTERS[source.kind];
  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({ data: { sourceId, startedAt } });
  const errors: string[] = [];
  let fetched = 0, inserted = 0, updated = 0, skipped = 0, closed = 0;
  const touched: string[] = [];
  try {
    let jobs: NormalizedJob[];
    let indexed: { entries: IndexEntry[]; etag: string | null; complete?: boolean } | null = null;

    if (adapter.poll && !force) {
      const polled = await adapter.poll({ slug: source.slug, name: source.name, etag: source.etag });
      if (polled.kind === "not-modified") {
        await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), notModified: true } });
        await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: "no change", failureCount: 0 } });
        return { fetched: 0, inserted: 0, updated: 0, skipped: 0, closed: 0, errors: 0, notModified: true };
      }
      if (polled.kind === "full") {
        jobs = polled.jobs;
        indexed = { entries: jobs.map((j) => ({ externalId: j.externalId, version: j.version ?? "" })), etag: polled.etag };
      } else {
        indexed = { entries: polled.entries, etag: polled.etag, complete: polled.complete };
        const known = new Map((await prisma.job.findMany({ where: { sourceId }, select: { externalId: true, sourceVersion: true } })).map((j) => [j.externalId, j.sourceVersion]));
        const changed = polled.entries.filter((e) => !known.has(e.externalId) || (known.get(e.externalId) ?? "") !== e.version);
        if (!changed.length) {
          jobs = [];
        } else if (!adapter.fetchOne || changed.length > SINGLE_FETCH_LIMIT) {
          jobs = await adapter.fetchJobs({ slug: source.slug, name: source.name });
        } else {
          const fetchedOnes = await Promise.all(changed.map((c) =>
            adapter.fetchOne!({ slug: source.slug, name: source.name, externalId: c.externalId })
              .catch((e) => { errors.push(`${c.externalId}: ${e instanceof Error ? e.message : String(e)}`); return null; })));
          jobs = fetchedOnes.filter((j): j is NormalizedJob => j !== null);
        }
      }
    } else {
      jobs = await adapter.fetchJobs({ slug: source.slug, name: source.name });
      indexed = { entries: jobs.map((j) => ({ externalId: j.externalId, version: j.version ?? "" })), etag: null };
    }

    // Everything the board still lists is alive, even the postings we did not re-parse: stamp them so expiry is accurate.
    if (indexed?.entries.length) {
      await prisma.job.updateMany({ where: { sourceId, externalId: { in: indexed.entries.map((e) => e.externalId) } }, data: { lastSeenAt: startedAt } });
    }
    fetched = indexed?.entries.length ?? jobs.length;
    for (const nj of jobs) {
      try {
        const r = await upsertNormalizedJob(source, nj);
        if (r.skipped) { skipped++; continue; }
        if (r.inserted) inserted++; else if (r.changed) updated++;
        if (r.changed) touched.push(r.id);
      } catch (e) { errors.push(`${nj.externalId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (fetched > 0 && indexed?.complete !== false) {
      // A board that answered with far fewer postings than last time most likely answered partially: keep its rows this run.
      const prev = await prisma.ingestionRun.findFirst({ where: { sourceId, id: { not: run.id }, finishedAt: { not: null }, notModified: false, fetched: { gt: 0 } }, orderBy: { startedAt: "desc" }, select: { fetched: true } });
      if (prev && prev.fetched > 0 && fetched < prev.fetched * 0.5) errors.push(`expiry skipped: fetched ${fetched} postings vs ${prev.fetched} last run`);
      else { const r = await expireUnseenJobs(source, startedAt); closed = r.deleted + r.closed; }
    }
    await markCrossCompanyDuplicates(touched).catch((e) => errors.push(`dedupe: ${e instanceof Error ? e.message : String(e)}`));
    // Embedding/matching and logo fetching run after the response (or on the worker); their failures never fail the run.
    if (touched.length) await enqueue("jobs.index", { jobIds: touched }).catch((e) => errors.push(`index: ${e instanceof Error ? e.message : String(e)}`));
    if (inserted) await enqueue("logos.resolve", { limit: 20 }).catch(() => undefined);
    const flagged = touched.length ? await prisma.job.count({ where: { id: { in: touched }, isLowQuality: true } }) : 0;
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), fetched, inserted, updated, flagged, errorsJson: errors.length ? errors.slice(0, 50) : undefined } });
    const status = `ok${inserted ? `, ${inserted} new` : ""}${updated ? `, ${updated} updated` : ""}${skipped ? `, ${skipped} skipped (outside ${COUNTRIES})` : ""}${closed ? `, ${closed} closed` : ""}${errors.length ? `, ${errors.length} errors` : ""}`;
    // The etag is only stored when the pass completed, so a failure re-reads the board instead of trusting a stale 304.
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: status, etag: errors.length ? null : indexed?.etag ?? null, failureCount: 0, lastIndexComplete: indexed?.complete !== false } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), fetched, inserted, updated, errorsJson: [msg, ...errors].slice(0, 50) } });
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: `failed: ${msg}`.slice(0, 200), etag: null, failureCount: { increment: 1 } } });
    throw e;
  }
  return { fetched, inserted, updated, skipped, closed, errors: errors.length };
}

/** After a successful full fetch, postings the source did not return this run are gone from its board: retire them. */
export async function expireUnseenJobs(source: Pick<JobSource, "id" | "kind">, startedAt: Date): Promise<{ deleted: number; closed: number }> {
  const before = new Date(startedAt.getTime() - (EXPIRE_GRACE_MS[source.kind] ?? 0));
  const unseen = await prisma.job.findMany({ where: { sourceId: source.id, closedAt: null, lastSeenAt: { lt: before } }, select: { id: true } });
  return retireJobs(unseen.map((u) => u.id));
}

/**
 * How often to poll each kind. API boards answer a conditional request in one small round trip, so they can be polled
 * every ten minutes; whole-site crawls and keyed search APIs are heavier and change more slowly.
 */
const POLL_MINUTES: Partial<Record<JobSourceKind, number>> = { CAREERS: 60, ADZUNA: 30, USAJOBS: 30, WORKDAY: 20, SEED: 1440, MANUAL: 1440 };
/** No single source may hold a worker for the whole tick: a slow board is abandoned and picked up next time. */
const SOURCE_TIMEOUT_MS: Partial<Record<JobSourceKind, number>> = { CAREERS: 240_000, WORKDAY: 120_000 };
const DEFAULT_SOURCE_TIMEOUT_MS = 90_000;
const FAST_POLL_MIN = Number(process.env.SCRAPE_POLL_MIN ?? 10);
const MAX_BACKOFF_MIN = 240;

export function pollIntervalMin(source: Pick<JobSource, "kind" | "intervalMin" | "failureCount">): number {
  const base = source.intervalMin > 0 ? source.intervalMin : POLL_MINUTES[source.kind] ?? FAST_POLL_MIN;
  const kindFloor = POLL_MINUTES[source.kind] ?? FAST_POLL_MIN;
  const interval = Math.max(base, kindFloor);
  // A source that keeps failing (board renamed, site blocking us) backs off instead of being retried every tick.
  return source.failureCount > 0 ? Math.min(interval * 2 ** Math.min(source.failureCount, 5), MAX_BACKOFF_MIN) : interval;
}

/** Whole-site crawls take minutes and change slowly; the API boards are what makes the feed feel live. */
const HEAVY_KINDS: ReadonlySet<JobSourceKind> = new Set<JobSourceKind>(["CAREERS", "WORKDAY"]);
const HEAVY_PER_TICK = Number(process.env.SCRAPE_HEAVY_PER_TICK ?? 4);

/** Concurrent slots should hit different hosts, so walk the due list kind by kind rather than in id order. */
function interleaveByKind<T extends { kind: JobSourceKind }>(rows: T[]): T[] {
  const byKind = new Map<JobSourceKind, T[]>();
  for (const r of rows) (byKind.get(r.kind) ?? byKind.set(r.kind, []).get(r.kind)!).push(r);
  const queues = [...byKind.values()];
  const out: T[] = [];
  for (let i = 0; out.length < rows.length; i++) for (const q of queues) if (q[i]) out.push(q[i]);
  return out;
}

export interface PollSummary { polled: number; notModified: number; inserted: number; updated: number; closed: number; failed: number; durationMs: number; due: number }

/**
 * One scheduler tick: poll every source whose turn has come, newest-due first, until the time budget runs out.
 * Unchanged boards cost one conditional request, so the whole catalogue can be swept well inside ten minutes.
 */
export async function pollDueSources(opts: { budgetMs?: number; concurrency?: number; limit?: number } = {}): Promise<PollSummary> {
  const budgetMs = opts.budgetMs ?? Number(process.env.SCRAPE_TICK_BUDGET_SEC ?? 420) * 1000;
  const concurrency = opts.concurrency ?? Number(process.env.SCRAPE_CONCURRENCY ?? 4);
  const startedAt = Date.now();
  const now = new Date();
  const due = await prisma.jobSource.findMany({
    where: { enabled: true, kind: { notIn: ["SEED", "MANUAL"] }, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
    orderBy: [{ nextRunAt: { sort: "asc", nulls: "first" } }],
    take: opts.limit ?? 400,
  });
  // Fast API boards first so a four-minute site crawl can never delay the freshness of the whole catalogue.
  const queue = [
    ...interleaveByKind(due.filter((d) => !HEAVY_KINDS.has(d.kind))),
    ...interleaveByKind(due.filter((d) => HEAVY_KINDS.has(d.kind))).slice(0, HEAVY_PER_TICK),
  ];
  const summary: PollSummary = { polled: 0, notModified: 0, inserted: 0, updated: 0, closed: 0, failed: 0, durationMs: 0, due: queue.length };
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (Date.now() - startedAt > budgetMs) return;
      const source = queue[cursor++];
      if (!source) return;
      try {
        const timeoutMs = SOURCE_TIMEOUT_MS[source.kind] ?? DEFAULT_SOURCE_TIMEOUT_MS;
        const r = await Promise.race([
          ingestSourceJob({ sourceId: source.id }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs).unref()),
        ]);
        summary.polled++;
        if (r && "notModified" in r && r.notModified) summary.notModified++;
        summary.inserted += r?.inserted ?? 0;
        summary.updated += r?.updated ?? 0;
        summary.closed += r?.closed ?? 0;
        await prisma.jobSource.update({ where: { id: source.id }, data: { nextRunAt: new Date(Date.now() + pollIntervalMin({ ...source, failureCount: 0 }) * 60_000) } });
      } catch (e) {
        summary.failed++;
        const failureCount = source.failureCount + 1;
        await prisma.jobSource.update({ where: { id: source.id }, data: { nextRunAt: new Date(Date.now() + pollIntervalMin({ ...source, failureCount }) * 60_000) } }).catch(() => undefined);
        console.warn(`[poll] ${source.kind}/${source.slug} failed:`, e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  summary.durationMs = Date.now() - startedAt;
  return summary;
}

/** Periodic tidying that does not belong in a ten-minute poll: stale flags, out-of-scope pruning, dedupe, logos, industries. */
export async function housekeepingJob() {
  await refreshStaleFlags();
  await pruneOutOfScope();
  await mergeDuplicatePostings().catch((e) => console.warn("[ingest] merge failed", e instanceof Error ? e.message : e));
  await resolveMissingLogos(100, { retry: true }).catch(() => 0);
  await syncKnownIndustries().catch((e) => console.warn("[ingest] industry sync failed", e instanceof Error ? e.message : e));
}

/** Every enabled source once, then housekeeping. Used by the CLI and the queue worker; the scheduler polls instead. */
export async function ingestAllJob(opts: { force?: boolean } = {}) {
  const sources = await prisma.jobSource.findMany({ where: { enabled: true } });
  for (const s of sources) {
    await ingestSourceJob({ sourceId: s.id, force: opts.force }).catch((e) => console.warn(`[ingest] ${s.kind}/${s.slug} failed:`, e instanceof Error ? e.message : e));
    await prisma.jobSource.update({ where: { id: s.id }, data: { nextRunAt: new Date(Date.now() + pollIntervalMin({ ...s, failureCount: 0 }) * 60_000) } }).catch(() => undefined);
  }
  await housekeepingJob();
}

/** Curated employer facts (industry, headcount bucket) beat keyword guesses and blanks: rewrite Company rows (and job industries) wherever the stored value disagrees. */
export async function syncKnownIndustries(): Promise<number> {
  const companies = await prisma.company.findMany({ where: { domain: { not: null } }, select: { id: true, domain: true, industry: true, size: true } });
  let fixed = 0;
  for (const c of companies) {
    const industry = industryForDomain(c.domain);
    const size = sizeForDomain(c.domain);
    const data: { industry?: string; size?: CompanySize } = {};
    if (industry && industry !== c.industry) data.industry = industry;
    if (size && size !== c.size) data.size = size;
    if (!Object.keys(data).length) continue;
    await prisma.company.update({ where: { id: c.id }, data });
    if (data.industry) await prisma.job.updateMany({ where: { companyId: c.id }, data: { industry: data.industry } });
    fixed++;
  }
  return fixed;
}

/** Retire postings whose location is outside JOBS_COUNTRIES (default US). Remote and unplaceable jobs stay. Batched by cursor. */
export async function pruneOutOfScope(): Promise<number> {
  let cursor: string | undefined;
  let removed = 0;
  for (;;) {
    const batch = await prisma.job.findMany({
      select: { id: true, location: true, isRemote: true }, where: { source: { kind: { not: "MANUAL" } } },
      orderBy: { id: "asc" }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) break;
    const drop = batch.filter((j) => !inScope(parseLocation(j.location), j.isRemote)).map((j) => j.id);
    const r = await retireJobs(drop);
    removed += r.deleted + r.closed;
    cursor = batch[batch.length - 1].id;
    if (batch.length < 1000) break;
  }
  return removed;
}

/**
 * Collapse rows that are one posting published once per office (same company + title, near-identical text) into one row
 * whose location lists every office. The oldest row keeps its id; rows a user acted on are never deleted.
 */
export async function mergeDuplicatePostings(): Promise<number> {
  const groups = await prisma.job.groupBy({ by: ["companyId", "normalizedTitle"], having: { id: { _count: { gt: 1 } } }, _count: { id: true } });
  let merged = 0;
  for (const g of groups) {
    const rows = await prisma.job.findMany({
      where: { companyId: g.companyId, normalizedTitle: g.normalizedTitle, closedAt: null },
      select: { id: true, fingerprint: true, location: true, lastSeenAt: true, _count: { select: { applications: true, resumeDocuments: true, conversations: true, outreachDrafts: true } } },
      orderBy: { firstSeenAt: "asc" },
    });
    const clusters: Array<typeof rows> = [];
    for (const r of rows) {
      const c = r.fingerprint ? clusters.find((cl) => cl[0].fingerprint && hammingDistance(cl[0].fingerprint, r.fingerprint!) <= 3) : undefined;
      if (c) c.push(r); else clusters.push([r]);
    }
    for (const c of clusters) {
      if (c.length < 2) continue;
      const touched = (r: (typeof rows)[number]) => Object.values(r._count).some((n) => n > 0);
      const keep = c.find(touched) ?? c[0];
      const drop = c.filter((r) => r.id !== keep.id && !touched(r));
      if (!drop.length) continue;
      let location = keep.location;
      let lastSeenAt = keep.lastSeenAt;
      for (const d of drop) { location = mergeLocations(location, d.location); if (d.lastSeenAt > lastSeenAt) lastSeenAt = d.lastSeenAt; }
      await prisma.job.update({ where: { id: keep.id }, data: { location, lastSeenAt } });
      await prisma.job.deleteMany({ where: { id: { in: drop.map((d) => d.id) } } });
      merged += drop.length;
    }
  }
  return merged;
}

/** Register the curated US companies (known boards directly, the rest through discovery) and ingest them. */
/** No company may hold up the bootstrap: discovery walks a site, and some sites are very slow. */
const BOOTSTRAP_TIMEOUT_MS = Number(process.env.BOOTSTRAP_TIMEOUT_MS ?? 120_000);
const withTimeout = <T>(work: Promise<T>, ms: number, what: string) =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms).unref())]);

/**
 * Register the curated employers and pull their first batch of postings. Companies already registered are skipped, so
 * re-running only works on what is missing (pass `all: true` to force a full pass).
 */
export async function bootstrapUsCompanies(opts: { limit?: number; all?: boolean; onProgress?: (msg: string) => void } = {}) {
  const { US_COMPANIES } = await import("./us-companies");
  const { discoverSources } = await import("./discover");
  const list = opts.limit ? US_COMPANIES.slice(0, opts.limit) : US_COMPANIES;
  const log = opts.onProgress ?? ((m: string) => console.log("[bootstrap]", m));
  const known = new Set((await prisma.jobSource.findMany({ where: { domain: { not: null } }, select: { domain: true } })).map((s) => s.domain!.toLowerCase()));
  let registered = 0, jobs = 0, skippedKnown = 0;
  for (const c of list) {
    if (!opts.all && known.has(c.domain.toLowerCase())) { skippedKnown++; continue; }
    try {
      let sources: Array<{ kind: JobSourceKind; slug: string }> = [];
      if (c.kind && c.slug) sources = [{ kind: c.kind, slug: c.slug }];
      else {
        const r = await withTimeout(discoverSources(c.domain), BOOTSTRAP_TIMEOUT_MS, `${c.name} discovery`);
        sources = r.found.map((f) => ({ kind: f.kind, slug: f.slug }));
        if (!sources.length) { log(`${c.name}: no public job source found`); continue; }
      }
      for (const src of sources.map((x) => ({ ...x, slug: x.slug.trim() }))) {
        const row = await prisma.jobSource.upsert({ where: { kind_slug: { kind: src.kind, slug: src.slug } }, create: { kind: src.kind, slug: src.slug, name: c.name, domain: c.domain, enabled: true }, update: { name: c.name, domain: c.domain, enabled: true } });
        registered++;
        const r = await withTimeout(ingestSourceJob({ sourceId: row.id }), BOOTSTRAP_TIMEOUT_MS, `${c.name} ingest`);
        jobs += r?.inserted ?? 0;
        // A crawl that finds almost nothing is a page that is not really a job board: register it, then switch it off
        // rather than polling a marketing page forever.
        if (src.kind === "CAREERS" && (r?.fetched ?? 0) < 3) {
          await prisma.jobSource.update({ where: { id: row.id }, data: { enabled: false, lastStatus: `disabled: only ${r?.fetched ?? 0} postings found` } });
          log(`${c.name} (careers/${src.slug}): only ${r?.fetched ?? 0} postings; disabled`);
          continue;
        }
        const unchanged = r && "notModified" in r && r.notModified;
        log(`${c.name} (${src.kind.toLowerCase()}/${src.slug}): ${unchanged ? "no change since the last poll" : `${r?.fetched ?? 0} listed, ${r?.inserted ?? 0} new${r?.updated ? `, ${r.updated} updated` : ""}${r?.skipped ? `, ${r.skipped} outside scope` : ""}`}`);
      }
    } catch (e) { log(`${c.name}: failed (${e instanceof Error ? e.message : String(e)})`); }
  }
  await resolveMissingLogos(300).catch(() => 0);
  log(`done: ${registered} sources, ${jobs} new jobs${skippedKnown ? `, ${skippedKnown} already registered` : ""}`);
  return { registered, jobs };
}
