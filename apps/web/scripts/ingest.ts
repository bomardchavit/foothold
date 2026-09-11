// Scraper pipeline CLI (public APIs + robots.txt-compliant crawling; no proxy/UA rotation).
//   npm run scrape                          run every enabled source once
//   npm run scrape -- --watch 30            run every 30 minutes until stopped
//   npm run scrape -- discover stripe.com   find where a company hosts its jobs and register the sources
//   npm run scrape -- careers https://example.com/careers   crawl a careers site (JSON-LD JobPosting)
//   npm run scrape -- greenhouse:stripe     run one source by kind:slug (created if missing)
//   npm run scrape -- export                write data/exports/jobs.json (normalized dump)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { ingestAllJob, ingestSourceJob } from "../src/lib/ingest/run";
import { discoverSources } from "../src/lib/ingest/discover";
import type { JobSourceKind } from "@prisma/client";

async function runKindSlug(kind: JobSourceKind, slug: string, name?: string) {
  const src = await prisma.jobSource.upsert({ where: { kind_slug: { kind, slug } }, create: { kind, slug, name: name ?? null, enabled: true }, update: { enabled: true } });
  const r = await ingestSourceJob({ sourceId: src.id });
  console.log(`${kind}/${slug}:`, r);
}

async function exportJobs() {
  const jobs = await prisma.job.findMany({ include: { company: true, source: { select: { kind: true, slug: true } } }, orderBy: { firstSeenAt: "desc" } });
  const dir = path.resolve(process.cwd(), "../../data/exports"); mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "jobs.json");
  writeFileSync(file, JSON.stringify(jobs.map((j) => ({
    id: j.id, source: `${j.source.kind.toLowerCase()}:${j.source.slug}`, externalId: j.externalId, title: j.title, company: { name: j.company.name, domain: j.company.domain, industry: j.company.industry, h1bSignal: j.company.h1bSignal },
    location: j.location, city: j.city, region: j.region, country: j.country, workplaceType: j.workplaceType, employmentType: j.employmentType, seniority: j.seniority,
    requiredSkills: j.requiredSkills, preferredSkills: j.preferredSkills, yearsMin: j.yearsMin, yearsMax: j.yearsMax, salary: { min: j.salaryMin, max: j.salaryMax, currency: j.salaryCurrency, period: j.salaryPeriod },
    postedAt: j.postedAt, firstSeenAt: j.firstSeenAt, lastSeenAt: j.lastSeenAt, applyUrl: j.applyUrl, qualityFlags: j.qualityFlags, description: j.description,
  })), null, 2));
  console.log(`wrote ${jobs.length} jobs to ${file}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const watchIdx = argv.indexOf("--watch");
  const everyMin = watchIdx >= 0 ? Number(argv[watchIdx + 1]) || 30 : 0;
  const args = watchIdx >= 0 ? argv.filter((_, i) => i !== watchIdx && i !== watchIdx + 1) : argv;
  const [cmd, arg] = args;
  const once = async () => {
    if (!cmd) { await ingestAllJob(); return; }
    if (cmd === "export") { await exportJobs(); return; }
    if (cmd === "discover") {
      if (!arg) throw new Error("usage: discover <domain-or-url>");
      const r = await discoverSources(arg);
      console.log(`company: ${r.name}\nvisited: ${r.visited.join(", ")}${r.blocked.length ? `\nblocked by robots.txt: ${r.blocked.join(", ")}` : ""}`);
      if (!r.found.length) { console.log("no job source found"); return; }
      for (const f of r.found) { console.log(`found ${f.kind} ${f.slug} (${f.url}) via ${f.evidence}`); await runKindSlug(f.kind, f.slug, f.name); }
      return;
    }
    if (cmd === "careers") { if (!arg) throw new Error("usage: careers <careers-url>"); await runKindSlug("CAREERS", arg); return; }
    const [k, ...rest] = cmd.split(":");
    const slug = rest.join(":");
    if (!slug) throw new Error(`usage: <kind>:<slug>, got ${cmd}`);
    await runKindSlug(k.toUpperCase() as JobSourceKind, slug);
  };
  if (!everyMin) { await once(); return; }
  console.log(`[ingest] watch mode: every ${everyMin} min`);
  for (;;) { try { await once(); } catch (e) { console.error("[ingest] run failed", e); } await new Promise((r) => setTimeout(r, everyMin * 60_000)); }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
