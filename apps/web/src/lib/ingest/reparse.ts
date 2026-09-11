import { createHash } from "node:crypto";
import { parseLocation, industryForDomain, normalizeIndustry } from "@foothold/shared";
import { prisma } from "../db";
import { parseJob } from "../llm/tasks/parseJob";
import { computeQualityFlags, QUALITY_FLAGS } from "./quality";
import { PARSER_VERSION } from "./normalize";
import { enqueue } from "../queue";

/**
 * Re-run the parser over stored postings without refetching them: skills, level, years, salary, industry, location parts and
 * quality flags are recomputed from the stored description, and the content hash is stamped with the current PARSER_VERSION
 * so the next crawl does not repeat the work. Adapter-provided facts (workplace, employment type, posted date) are kept.
 * Changed rows are re-embedded and re-scored for every profile.
 */
export async function reparseJobs(opts: { onProgress?: (scanned: number, changed: number) => void } = {}): Promise<{ scanned: number; changed: number }> {
  let cursor: string | undefined;
  let scanned = 0, changed = 0;
  const touched: string[] = [];
  for (;;) {
    const batch = await prisma.job.findMany({
      where: { source: { kind: { not: "MANUAL" } } }, include: { company: { select: { name: true, domain: true, industry: true } }, source: { select: { kind: true } } },
      orderBy: { id: "asc" }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) break;
    for (const j of batch) {
      scanned++;
      const { parsed } = await parseJob({ title: j.title, description: j.description, location: j.location, company: j.company.name });
      const loc = parseLocation(j.location);
      const salaryMin = parsed.salaryMin ?? j.salaryMin, salaryMax = parsed.salaryMax ?? j.salaryMax, salaryPeriod = parsed.salaryPeriod ?? j.salaryPeriod;
      const flags = computeQualityFlags({ description: j.description, postedAt: j.postedAt, lastSeenAt: j.lastSeenAt, salaryMin, salaryMax, salaryPeriod, companyDomain: j.company.domain, sourceKind: j.source.kind });
      if (j.closedAt && !flags.includes(QUALITY_FLAGS.CLOSED)) flags.push(QUALITY_FLAGS.CLOSED);
      const data = {
        requiredSkills: parsed.requiredSkills, preferredSkills: parsed.preferredSkills, seniority: parsed.seniority, yearsMin: parsed.yearsMin, yearsMax: parsed.yearsMax,
        salaryMin, salaryMax, salaryPeriod, salaryCurrency: parsed.salaryCurrency ?? j.salaryCurrency ?? (salaryMin ? "USD" : null),
        industry: industryForDomain(j.company.domain) ?? normalizeIndustry(parsed.industry) ?? j.company.industry ?? j.industry,
        city: loc.city, region: loc.region, country: loc.country, qualityFlags: flags, isLowQuality: flags.length > 0,
        contentHash: createHash("sha1").update(`${PARSER_VERSION}|${j.title}|${j.company.name}|${j.description}|${j.location ?? ""}|${j.applyUrl}`).digest("hex"),
      };
      const before = JSON.stringify({ r: j.requiredSkills, p: j.preferredSkills, s: j.seniority, y: [j.yearsMin, j.yearsMax], $: [j.salaryMin, j.salaryMax, j.salaryPeriod], i: j.industry, l: [j.city, j.region, j.country], q: j.qualityFlags });
      const after = JSON.stringify({ r: data.requiredSkills, p: data.preferredSkills, s: data.seniority, y: [data.yearsMin, data.yearsMax], $: [data.salaryMin, data.salaryMax, data.salaryPeriod], i: data.industry, l: [data.city, data.region, data.country], q: data.qualityFlags });
      if (before === after && j.contentHash === data.contentHash) continue;
      await prisma.job.update({ where: { id: j.id }, data });
      if (before !== after) { changed++; touched.push(j.id); }
    }
    cursor = batch[batch.length - 1].id;
    opts.onProgress?.(scanned, changed);
    if (batch.length < 200) break;
  }
  for (let i = 0; i < touched.length; i += 500) await enqueue("jobs.index", { jobIds: touched.slice(i, i + 500) });
  return { scanned, changed };
}
