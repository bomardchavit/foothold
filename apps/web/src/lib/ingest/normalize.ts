import { createHash } from "node:crypto";
import type { JobSource } from "@prisma/client";
import { normalizeCompanyName, normalizeText, parseLocation, normalizeIndustry, simhash, type NormalizedJob } from "@foothold/shared";
import { prisma } from "../db";
import { parseJob } from "../llm/tasks/parseJob";
import { computeQualityFlags } from "./quality";
import { refreshCompanySignal } from "../h1b/signal";

/** Bump when job parsing changes so the next ingest run re-parses unchanged postings. */
export const PARSER_VERSION = "2";

export async function upsertNormalizedJob(source: JobSource, nj: NormalizedJob): Promise<{ id: string; inserted: boolean; changed: boolean }> {
  const description = nj.description.trim();
  const contentHash = createHash("sha1").update(`${PARSER_VERSION}|${nj.title}|${nj.company}|${description}`).digest("hex");
  const normalizedName = normalizeCompanyName(nj.company) || normalizeText(nj.company);
  let company = await prisma.company.findUnique({ where: { normalizedName } });
  let newCompany = false;
  if (!company) {
    company = await prisma.company.create({ data: { name: nj.company.trim(), normalizedName, domain: nj.companyDomain ?? null, industry: normalizeIndustry(nj.companyIndustry) ?? null, size: nj.companySize ?? null } });
    newCompany = true;
  } else if ((!company.domain && nj.companyDomain) || (!company.industry && nj.companyIndustry)) {
    company = await prisma.company.update({ where: { id: company.id }, data: { domain: company.domain ?? nj.companyDomain ?? null, industry: company.industry ?? normalizeIndustry(nj.companyIndustry) ?? null } });
  }
  if (newCompany) await refreshCompanySignal(company.id).catch((e) => console.warn("[h1b] signal failed", e));

  const existing = await prisma.job.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: nj.externalId } } });
  if (existing && existing.contentHash === contentHash) {
    await prisma.job.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
    return { id: existing.id, inserted: false, changed: false };
  }
  const { parsed } = await parseJob({ title: nj.title, description, location: nj.location });
  const loc = parseLocation(nj.location);
  const isRemote = Boolean(nj.isRemote) || parsed.isRemote || loc.isRemote;
  const postedAt = nj.postedAt ? new Date(nj.postedAt) : existing?.postedAt ?? new Date();
  const industry = normalizeIndustry(parsed.industry) ?? company.industry ?? null;
  const salaryMin = nj.salaryMin ?? parsed.salaryMin ?? null;
  const salaryMax = nj.salaryMax ?? parsed.salaryMax ?? null;
  const salaryPeriod = nj.salaryPeriod ?? parsed.salaryPeriod ?? null;
  const qualityFlags = computeQualityFlags({ description, postedAt, salaryMin, salaryMax, salaryPeriod, companyDomain: company.domain, sourceKind: source.kind });
  const data = {
    title: nj.title.trim(), normalizedTitle: normalizeText(nj.title), description, location: nj.location ?? null,
    city: loc.city, region: loc.region, country: loc.country, isRemote, seniority: parsed.seniority,
    requiredSkills: parsed.requiredSkills, preferredSkills: parsed.preferredSkills, yearsMin: parsed.yearsMin, yearsMax: parsed.yearsMax,
    salaryMin, salaryMax, salaryCurrency: nj.salaryCurrency ?? parsed.salaryCurrency ?? (salaryMin ? "USD" : null), salaryPeriod,
    industry, postedAt, lastSeenAt: new Date(), applyUrl: nj.applyUrl, contentHash, fingerprint: simhash(description),
    qualityFlags, isLowQuality: qualityFlags.length > 0, parseStatus: "DONE" as const, rawJson: (nj.raw ?? null) as object | null,
    companyId: company.id,
  };
  const job = existing
    ? await prisma.job.update({ where: { id: existing.id }, data: { ...data, rawJson: data.rawJson ?? undefined } })
    : await prisma.job.create({ data: { ...data, sourceId: source.id, externalId: nj.externalId, rawJson: data.rawJson ?? undefined } });
  if (!company.industry && industry) await prisma.company.update({ where: { id: company.id }, data: { industry } });
  return { id: job.id, inserted: !existing, changed: true };
}
