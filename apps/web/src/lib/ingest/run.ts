import { prisma } from "../db";
import { ADAPTERS } from "./sources";
import { upsertNormalizedJob } from "./normalize";
import { markCrossCompanyDuplicates, refreshStaleFlags } from "./quality";
import { runJobNow } from "../queue";

export async function ingestSourceJob({ sourceId }: { sourceId: string }) {
  const source = await prisma.jobSource.findUnique({ where: { id: sourceId } });
  if (!source || !source.enabled) return;
  const run = await prisma.ingestionRun.create({ data: { sourceId } });
  const errors: string[] = [];
  let fetched = 0, inserted = 0, updated = 0;
  const touched: string[] = [];
  try {
    const jobs = await ADAPTERS[source.kind].fetchJobs({ slug: source.slug, name: source.name });
    fetched = jobs.length;
    for (const nj of jobs) {
      try {
        const r = await upsertNormalizedJob(source, nj);
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
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: errors.length ? `ok with ${errors.length} errors` : "ok" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), fetched, inserted, updated, errorsJson: [msg, ...errors].slice(0, 50) } });
    await prisma.jobSource.update({ where: { id: sourceId }, data: { lastRunAt: new Date(), lastStatus: `failed: ${msg}`.slice(0, 200) } });
    throw e;
  }
  return { fetched, inserted, updated, errors: errors.length };
}

export async function ingestAllJob() {
  const sources = await prisma.jobSource.findMany({ where: { enabled: true } });
  for (const s of sources) {
    if (ADAPTERS[s.kind].needsKey === false || s.kind === "SEED" || true) {
      await ingestSourceJob({ sourceId: s.id }).catch((e) => console.warn(`[ingest] ${s.kind}/${s.slug} failed:`, e instanceof Error ? e.message : e));
    }
  }
  await refreshStaleFlags();
}
