import { createHash } from "node:crypto";
import type { JobSource } from "@prisma/client";
import { normalizeCompanyName, normalizeText, parseLocation, normalizeIndustry, simhash, hammingDistance, type NormalizedJob } from "@foothold/shared";
import { prisma } from "../db";
import { parseJob } from "../llm/tasks/parseJob";
import { computeQualityFlags } from "./quality";
import { refreshCompanySignal } from "../h1b/signal";

const ALLOWED_COUNTRIES = (process.env.JOBS_COUNTRIES ?? "US").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

/** Country scope: keep jobs in the allowed countries, remote jobs, and jobs whose location we cannot place. */
export function inScope(loc: { country: string | null; isRemote: boolean; raw: string }, isRemote: boolean): boolean {
  if (!ALLOWED_COUNTRIES.length || ALLOWED_COUNTRIES.includes("ALL")) return true;
  if (loc.country) return ALLOWED_COUNTRIES.includes(loc.country);
  if (isRemote || loc.isRemote) return true;
  return !loc.raw || !/\b(canada|india|uk|united kingdom|london|germany|berlin|france|paris|ireland|dublin|netherlands|amsterdam|spain|australia|sydney|singapore|japan|tokyo|brazil|mexico|israel|poland|toronto|vancouver|bangalore|bengaluru|hyderabad|pune|mumbai|europe|emea|apac|latam)\b/i.test(loc.raw);
}

/** Bump when job parsing changes so the next ingest run re-parses unchanged postings. */
export const PARSER_VERSION = "6";

export async function upsertNormalizedJob(source: JobSource, nj: NormalizedJob): Promise<{ id: string; inserted: boolean; changed: boolean; skipped?: "out-of-scope" }> {
  const description = nj.description.trim();
  const locEarly = parseLocation(nj.location);
  if (!inScope(locEarly, Boolean(nj.isRemote))) return { id: "", inserted: false, changed: false, skipped: "out-of-scope" };
  nj = { ...nj, companyDomain: nj.companyDomain ?? source.domain ?? undefined };
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
  // Cross-source dedupe: the same posting reached through another source (careers page vs ATS board) is one job.
  if (!existing) {
    const fp = simhash(description);
    const twin = await prisma.job.findFirst({ where: { companyId: company.id, normalizedTitle: normalizeText(nj.title), sourceId: { not: source.id } }, select: { id: true, fingerprint: true } });
    if (twin?.fingerprint && hammingDistance(twin.fingerprint, fp) <= 3) {
      await prisma.job.update({ where: { id: twin.id }, data: { lastSeenAt: new Date() } });
      return { id: twin.id, inserted: false, changed: false };
    }
  }
  const { parsed } = await parseJob({ title: nj.title, description, location: nj.location });
  const loc = locEarly;
  const isRemote = Boolean(nj.isRemote) || parsed.isRemote || loc.isRemote;
  const workplaceType = nj.workplaceType ?? (isRemote && parsed.workplaceType !== "HYBRID" ? "REMOTE" : parsed.workplaceType);
  const employmentType = nj.employmentType ?? parsed.employmentType;
  const postedAt = nj.postedAt ? new Date(nj.postedAt) : existing?.postedAt ?? new Date();
  const industry = normalizeIndustry(parsed.industry) ?? company.industry ?? null;
  const salaryMin = nj.salaryMin ?? parsed.salaryMin ?? null;
  const salaryMax = nj.salaryMax ?? parsed.salaryMax ?? null;
  const salaryPeriod = nj.salaryPeriod ?? parsed.salaryPeriod ?? null;
  const qualityFlags = computeQualityFlags({ description, postedAt, salaryMin, salaryMax, salaryPeriod, companyDomain: company.domain, sourceKind: source.kind });
  const data = {
    title: nj.title.trim(), normalizedTitle: normalizeText(nj.title), description, location: nj.location ?? null,
    city: loc.city, region: loc.region, country: loc.country, isRemote, workplaceType, employmentType, seniority: parsed.seniority,
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
