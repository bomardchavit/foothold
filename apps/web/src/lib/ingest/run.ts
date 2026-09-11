import type { JobSource, JobSourceKind } from "@prisma/client";
import { hammingDistance, parseLocation } from "@foothold/shared";
import { prisma } from "../db";
import { ADAPTERS } from "./sources";
import { upsertNormalizedJob, retireJobs, inScope, mergeLocations } from "./normalize";
import { markCrossCompanyDuplicates, refreshStaleFlags } from "./quality";
import { enqueue } from "../queue";
import { resolveMissingLogos } from "../logos/resolve";

const COUNTRIES = process.env.JOBS_COUNTRIES ?? "US";
/** Careers crawls are best-effort (a hub that fails to render one run hides its postings), so they get a grace period before postings are retired. */
const EXPIRE_GRACE_MS: Partial<Record<JobSourceKind, number>> = { CAREERS: 2 * 86400_000 };

export async function ingestSourceJob({ sourceId }: { sourceId: string }) {
  const source = await prisma.jobSource.findUnique({ where: { id: sourceId } });
  if (!source || !source.enabled) return;
  const startedAt = new Date();
  const run = await prisma.ingestionRun.create({ data: { sourceId, startedAt } });
  const errors: string[] = [];
  let fetched = 0, inserted = 0, updated = 0, skipped = 0, closed = 0;
  const touched: string[] = [];
  try {
    const jobs = await ADAPTERS[source.kind].fetchJobs({ slug: source.slug, name: source.name });
    fetched = jobs.length;
    for (const nj of jobs) {
      try {
        const r = await upsertNormalizedJob(source, nj);
        if (r.skipped) { skipped++; continue; }
        if (r.inserted) inserted++; else if (r.changed) updated++;
        if (r.changed) touched.push(r.id);
      } catch (e) { errors.push(`${nj.externalId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (fetched > 0) {
      // A board that answered with far fewer postings than last time most likely answered partially: keep its rows this run.
      const prev = await prisma.ingestionRun.findFirst({ where: { sourceId, id: { not: run.id }, finishedAt: { not: null } }, orderBy: { startedAt: "desc" }, select: { fetched: true } });
      if (prev && prev.fetched > 0 && fetched < prev.fetched * 0.5) errors.push(`expiry skipped: fetched ${fetched} postings vs ${prev.fetched} last run`);
      else { const r = await expireUnseenJobs(source, startedAt); closed = r.deleted + r.closed; }
    }
    await markCrossCompanyDuplicates(touched).catch((e) => errors.push(`dedupe: ${e instanceof Error ? e.message : String(e)}`));
    // Embedding/matching and logo fetching run after the response (or on the worker); their failures never fail the run.
    if (touched.length) await enqueue("jobs.index", { jobIds: touched }).catch((e) => errors.push(`index: ${e instanceof Error ? e.message : String(e)}`));
    if (inserted) await enqueue("logos.resolve", { limit: 20 }).catch(() => undefined);
    const flagged = touched.length ? await prisma.job.count({ where: { id: { in: touched }, isLowQuality: true } }) : 0;
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), fetched, inserted, updated, flagged, errorsJson: errors.length ? errors.slice(0, 50) : undefined } });
    const status = `ok${skipped ? `, ${skipped} skipped (outside ${COUNTRIES})` : ""}${closed ? `, ${closed} closed` : ""}${errors.length ? `, ${errors.length} errors` : ""}`;
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: status } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), fetched, inserted, updated, errorsJson: [msg, ...errors].slice(0, 50) } });
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: `failed: ${msg}`.slice(0, 200) } });
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

export async function ingestAllJob() {
  const sources = await prisma.jobSource.findMany({ where: { enabled: true } });
  for (const s of sources) {
    await ingestSourceJob({ sourceId: s.id }).catch((e) => console.warn(`[ingest] ${s.kind}/${s.slug} failed:`, e instanceof Error ? e.message : e));
  }
  await refreshStaleFlags();
  await pruneOutOfScope();
  await mergeDuplicatePostings().catch((e) => console.warn("[ingest] merge failed", e instanceof Error ? e.message : e));
  await resolveMissingLogos(100, { retry: true }).catch(() => 0);
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
export async function bootstrapUsCompanies(opts: { limit?: number; onProgress?: (msg: string) => void } = {}) {
  const { US_COMPANIES } = await import("./us-companies");
  const { discoverSources } = await import("./discover");
  const list = opts.limit ? US_COMPANIES.slice(0, opts.limit) : US_COMPANIES;
  const log = opts.onProgress ?? ((m: string) => console.log("[bootstrap]", m));
  let registered = 0, jobs = 0;
  for (const c of list) {
    try {
      let sources: Array<{ kind: JobSourceKind; slug: string }> = [];
      if (c.kind && c.slug) sources = [{ kind: c.kind, slug: c.slug }];
      else {
        const r = await discoverSources(c.domain);
        sources = r.found.map((f) => ({ kind: f.kind, slug: f.slug }));
        if (!sources.length) { log(`${c.name}: no public job source found`); continue; }
      }
      for (const src of sources) {
        const row = await prisma.jobSource.upsert({ where: { kind_slug: { kind: src.kind, slug: src.slug } }, create: { kind: src.kind, slug: src.slug, name: c.name, domain: c.domain, enabled: true }, update: { name: c.name, domain: c.domain, enabled: true } });
        registered++;
        const r = await ingestSourceJob({ sourceId: row.id });
        jobs += r?.inserted ?? 0;
        log(`${c.name} (${src.kind.toLowerCase()}/${src.slug}): ${r?.fetched ?? 0} fetched, ${r?.inserted ?? 0} new${r?.skipped ? `, ${r.skipped} outside scope` : ""}`);
      }
    } catch (e) { log(`${c.name}: failed (${e instanceof Error ? e.message : String(e)})`); }
  }
  await resolveMissingLogos(300).catch(() => 0);
  log(`done: ${registered} sources, ${jobs} new jobs`);
  return { registered, jobs };
}
