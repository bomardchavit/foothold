import type { JobSourceKind } from "@prisma/client";
import { prisma } from "../db";
import { ADAPTERS } from "./sources";
import { upsertNormalizedJob } from "./normalize";
import { markCrossCompanyDuplicates, refreshStaleFlags } from "./quality";
import { runJobNow } from "../queue";
import { resolveMissingLogos } from "../logos/resolve";
import { parseLocation } from "@foothold/shared";
import { inScope } from "./normalize";

export async function ingestSourceJob({ sourceId }: { sourceId: string }) {
  const source = await prisma.jobSource.findUnique({ where: { id: sourceId } });
  if (!source || !source.enabled) return;
  const run = await prisma.ingestionRun.create({ data: { sourceId } });
  const errors: string[] = [];
  let fetched = 0, inserted = 0, updated = 0, skipped = 0;
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
    await markCrossCompanyDuplicates(touched);
    if (touched.length) {
      await runJobNow("jobs.embed", { jobIds: touched });
      await runJobNow("match.jobs", { jobIds: touched });
    }
    const flagged = touched.length ? await prisma.job.count({ where: { id: { in: touched }, isLowQuality: true } }) : 0;
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), fetched, inserted, updated, flagged, errorsJson: errors.length ? errors.slice(0, 50) : undefined } });
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: `ok${skipped ? `, ${skipped} outside the job-country scope` : ""}${errors.length ? `, ${errors.length} errors` : ""}` } });
    await resolveMissingLogos(20).catch(() => 0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), fetched, inserted, updated, errorsJson: [msg, ...errors].slice(0, 50) } });
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: `failed: ${msg}`.slice(0, 200) } });
    throw e;
  }
  return { fetched, inserted, updated, skipped, errors: errors.length };
}

export async function ingestAllJob() {
  const sources = await prisma.jobSource.findMany({ where: { enabled: true } });
  for (const s of sources) {
    await ingestSourceJob({ sourceId: s.id }).catch((e) => console.warn(`[ingest] ${s.kind}/${s.slug} failed:`, e instanceof Error ? e.message : e));
  }
  await refreshStaleFlags();
  await pruneOutOfScope();
  await resolveMissingLogos(100).catch(() => 0);
}

/** Remove postings whose location is outside JOBS_COUNTRIES (default US). Remote and unplaceable jobs stay. */
export async function pruneOutOfScope(): Promise<number> {
  const jobs = await prisma.job.findMany({ select: { id: true, location: true, isRemote: true }, where: { source: { kind: { not: "MANUAL" } } } });
  const drop = jobs.filter((j) => !inScope(parseLocation(j.location), j.isRemote)).map((j) => j.id);
  if (drop.length) await prisma.job.deleteMany({ where: { id: { in: drop } } });
  return drop.length;
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
