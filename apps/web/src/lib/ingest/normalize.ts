import { createHash } from "node:crypto";
import type { JobSource } from "@prisma/client";
import { normalizeCompanyName, normalizeText, parseLocation, normalizeIndustry, simhash, hammingDistance, US_STATES, type NormalizedJob } from "@foothold/shared";
import { prisma } from "../db";
import { parseJob } from "../llm/tasks/parseJob";
import { computeQualityFlags, QUALITY_FLAGS } from "./quality";
import { refreshCompanySignal } from "../h1b/signal";
import { countriesNamed, cityCountries, foldPlace } from "./gazetteer";
import { ATS_HOSTS } from "../logos/resolve";

const ALLOWED_COUNTRIES = (process.env.JOBS_COUNTRIES ?? "US").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
const STATE_NAMES = new Set(Object.values(US_STATES).map((n) => n.toLowerCase()));
const STATE_CODES = new Set(Object.keys(US_STATES));

/**
 * Countries a raw location string names, from the text alone (parentheticals like "(Hybrid)" ignored):
 * explicit country names win; then a US state token ("Paris, TX", "Cambridge, MA" — a two-letter code counts unless it
 * doubles as the ISO code of a city named in the same string, so "Toronto, CA" stays Canadian); then non-US city names.
 * Null when the string places nothing.
 */
export function countryFromPlaces(raw: string): string[] | null {
  const text = raw.replace(/\(.*?\)/g, " ");
  const named = countriesNamed(text);
  if (named.length) return named;
  const cities = cityCountries(text);
  for (const t of text.split(/[,;|/·•]|\s[-–]\s/).map((s) => s.trim().replace(/\s+\d{5}(?:-\d{4})?$/, ""))) {
    if (STATE_NAMES.has(t.toLowerCase())) return ["US"];
    if (/^[A-Z]{2}$/.test(t) && STATE_CODES.has(t) && !cities.includes(t)) return ["US"];
  }
  return cities.length ? cities : null;
}

/**
 * Country scope (JOBS_COUNTRIES, default US): keep jobs placed in an allowed country and jobs we cannot place at all.
 * A posting that names a foreign place is out even when it is remote or hybrid ("Remote India (Hybrid)" is not a US job).
 */
export function inScope(loc: { country: string | null; isRemote: boolean; raw: string }, isRemote: boolean): boolean {
  if (!ALLOWED_COUNTRIES.length || ALLOWED_COUNTRIES.includes("ALL")) return true;
  const allowed = (c: string) => ALLOWED_COUNTRIES.includes(c);
  const placed = loc.raw ? countryFromPlaces(loc.raw) : null;
  if (placed) return placed.some(allowed);
  if (loc.country) return allowed(loc.country);
  void isRemote; // remote or unplaceable: keep
  return true;
}

/** Bump when job parsing changes so the next ingest run re-parses unchanged postings. */
export const PARSER_VERSION = "7";

/** Company domain from a direct apply URL when the source has none (hand-added boards need it for logos and quality flags). */
function domainFromApplyUrl(applyUrl: string): string | undefined {
  try { const h = new URL(applyUrl).hostname.replace(/^www\./, ""); return ATS_HOSTS.test(h) ? undefined : h; } catch { return undefined; }
}

const placeKey = (s: string) => foldPlace(s).replace(/[^a-z0-9]+/g, " ").trim();
/** One posting published per office becomes one row whose location lists every office ("New York, NY; Denver, CO"). */
export function mergeLocations(current: string | null, incoming: string | null | undefined): string | null {
  if (!incoming?.trim()) return current;
  if (!current?.trim()) return incoming.trim();
  const have = placeKey(current);
  const add = incoming.trim();
  const city = parseLocation(add).city;
  if (have.includes(placeKey(add)) || (city && have.includes(placeKey(city)))) return current;
  const parts = current.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 6) return current;
  return [...parts, add].join("; ");
}

/** A closed row the source lists again is open again. */
function reopen(job: { closedAt: Date | null; qualityFlags: string[] }) {
  if (!job.closedAt) return {};
  const qualityFlags = job.qualityFlags.filter((f) => f !== QUALITY_FLAGS.CLOSED);
  return { closedAt: null, qualityFlags, isLowQuality: qualityFlags.length > 0 };
}

/**
 * Retire postings the source no longer lists (or that fell out of scope). Rows a user has acted on — application, tailored
 * résumé, chat, outreach — are kept and marked closed so the tracker keeps its history; everything else is deleted.
 */
export async function retireJobs(ids: string[]): Promise<{ deleted: number; closed: number }> {
  if (!ids.length) return { deleted: 0, closed: 0 };
  const keep = await prisma.job.findMany({
    where: { id: { in: ids }, OR: [{ applications: { some: {} } }, { resumeDocuments: { some: {} } }, { conversations: { some: {} } }, { outreachDrafts: { some: {} } }] },
    select: { id: true, closedAt: true, qualityFlags: true },
  });
  const now = new Date();
  for (const k of keep) {
    if (k.closedAt) continue;
    const qualityFlags = k.qualityFlags.includes(QUALITY_FLAGS.CLOSED) ? k.qualityFlags : [...k.qualityFlags, QUALITY_FLAGS.CLOSED];
    await prisma.job.update({ where: { id: k.id }, data: { closedAt: now, qualityFlags, isLowQuality: true } });
  }
  const kept = new Set(keep.map((k) => k.id));
  const del = ids.filter((id) => !kept.has(id));
  if (del.length) await prisma.job.deleteMany({ where: { id: { in: del } } });
  return { deleted: del.length, closed: keep.length };
}

export async function upsertNormalizedJob(source: JobSource, nj: NormalizedJob): Promise<{ id: string; inserted: boolean; changed: boolean; skipped?: "out-of-scope" }> {
  const description = nj.description.trim();
  const locEarly = parseLocation(nj.location);
  if (!inScope(locEarly, Boolean(nj.isRemote))) {
    // An older parser may have stored this posting under a wrong location: it must not linger in the feed.
    const stale = await prisma.job.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: nj.externalId } }, select: { id: true } });
    if (stale) await retireJobs([stale.id]);
    return { id: "", inserted: false, changed: false, skipped: "out-of-scope" };
  }
  nj = { ...nj, companyDomain: nj.companyDomain ?? source.domain ?? domainFromApplyUrl(nj.applyUrl) };
  const contentHash = createHash("sha1").update(`${PARSER_VERSION}|${nj.title}|${nj.company}|${description}|${nj.location ?? ""}|${nj.applyUrl}`).digest("hex");
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

  const now = new Date();
  const existing = await prisma.job.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: nj.externalId } } });
  if (existing && existing.contentHash === contentHash) {
    await prisma.job.update({ where: { id: existing.id }, data: { lastSeenAt: now, ...reopen(existing) } });
    return { id: existing.id, inserted: false, changed: false };
  }
  const fingerprint = simhash(description);
  // Dedupe within the company: the same text reached through another source (careers page vs ATS board) or published once
  // per office is one job. Up to 20 same-title candidates, most recently seen first, nearest fingerprint wins.
  if (!existing) {
    const candidates = await prisma.job.findMany({ where: { companyId: company.id, normalizedTitle: normalizeText(nj.title) }, select: { id: true, fingerprint: true, location: true, closedAt: true, qualityFlags: true }, orderBy: { lastSeenAt: "desc" }, take: 20 });
    const twin = candidates.find((c) => c.fingerprint && hammingDistance(c.fingerprint, fingerprint) <= 3);
    if (twin) {
      await prisma.job.update({ where: { id: twin.id }, data: { lastSeenAt: now, location: mergeLocations(twin.location, nj.location), ...reopen(twin) } });
      return { id: twin.id, inserted: false, changed: false };
    }
  }
  const { parsed } = await parseJob({ title: nj.title, description, location: nj.location });
  const loc = locEarly;
  const remoteSignal = Boolean(nj.isRemote) || parsed.isRemote || loc.isRemote;
  const workplaceType = nj.workplaceType ?? (remoteSignal && parsed.workplaceType !== "HYBRID" ? "REMOTE" : parsed.workplaceType);
  const isRemote = workplaceType === "REMOTE"; // hybrid and onsite postings are never remote, whatever the office list says
  const employmentType = nj.employmentType ?? parsed.employmentType;
  const postedAt = nj.postedAt ? new Date(nj.postedAt) : existing?.postedAt ?? new Date();
  const industry = normalizeIndustry(parsed.industry) ?? company.industry ?? null;
  const salaryMin = nj.salaryMin ?? parsed.salaryMin ?? null;
  const salaryMax = nj.salaryMax ?? parsed.salaryMax ?? null;
  const salaryPeriod = nj.salaryPeriod ?? parsed.salaryPeriod ?? null;
  const qualityFlags = computeQualityFlags({ description, postedAt, lastSeenAt: now, salaryMin, salaryMax, salaryPeriod, companyDomain: company.domain, sourceKind: source.kind });
  const data = {
    title: nj.title.trim(), normalizedTitle: normalizeText(nj.title), description, location: nj.location ?? null,
    city: loc.city, region: loc.region, country: loc.country, isRemote, workplaceType, employmentType, seniority: parsed.seniority,
    requiredSkills: parsed.requiredSkills, preferredSkills: parsed.preferredSkills, yearsMin: parsed.yearsMin, yearsMax: parsed.yearsMax,
    salaryMin, salaryMax, salaryCurrency: nj.salaryCurrency ?? parsed.salaryCurrency ?? (salaryMin ? "USD" : null), salaryPeriod,
    industry, postedAt, lastSeenAt: now, closedAt: null, applyUrl: nj.applyUrl, contentHash, fingerprint,
    qualityFlags, isLowQuality: qualityFlags.length > 0, parseStatus: "DONE" as const, rawJson: (nj.raw ?? null) as object | null,
    companyId: company.id,
  };
  const job = existing
    ? await prisma.job.update({ where: { id: existing.id }, data: { ...data, rawJson: data.rawJson ?? undefined } })
    : await prisma.job.create({ data: { ...data, sourceId: source.id, externalId: nj.externalId, rawJson: data.rawJson ?? undefined } });
  if (!company.industry && industry) await prisma.company.update({ where: { id: company.id }, data: { industry } });
  return { id: job.id, inserted: !existing, changed: true };
}
