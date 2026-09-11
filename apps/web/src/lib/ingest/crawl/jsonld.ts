import { createHash } from "node:crypto";
import { stripHtml, decodeEntities, type NormalizedJob } from "@foothold/shared";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);

function collect(node: unknown, out: Obj[]) {
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return; }
  if (!isObj(node)) return;
  const t = node["@type"];
  const types = Array.isArray(t) ? t : t ? [t] : [];
  if (types.some((x) => String(x).toLowerCase() === "jobposting")) out.push(node);
  for (const key of ["@graph", "itemListElement", "mainEntity", "item", "hasPart"]) if (node[key]) collect(node[key], out);
}

/** All <script type="application/ld+json"> blocks on a page, tolerant of bad JSON. */
export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const rx = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const body = decodeEntities(m[1].trim()).replace(/^\s*<!--/, "").replace(/-->\s*$/, "");
    try { out.push(JSON.parse(body)); } catch { try { out.push(JSON.parse(body.replace(/[\x00-\x1f]+/g, " "))); } catch { /* skip malformed block */ } }
  }
  return out;
}

const EMPLOYMENT: Record<string, NormalizedJob["employmentType"]> = { FULL_TIME: "FULL_TIME", PART_TIME: "PART_TIME", CONTRACTOR: "CONTRACT", CONTRACT: "CONTRACT", TEMPORARY: "TEMPORARY", INTERN: "INTERNSHIP", INTERNSHIP: "INTERNSHIP", PER_DIEM: "TEMPORARY", VOLUNTEER: "UNKNOWN", OTHER: "UNKNOWN" };

function locationText(v: unknown): string | null {
  const items = Array.isArray(v) ? v : v ? [v] : [];
  const parts: string[] = [];
  for (const it of items) {
    if (!isObj(it)) { if (typeof it === "string") parts.push(it); continue; }
    const addr = isObj(it.address) ? it.address : it;
    const s = [str(addr.addressLocality), str(addr.addressRegion), str(addr.addressCountry)].filter(Boolean).join(", ") || str(it.name);
    if (s) parts.push(s);
  }
  return parts.length ? [...new Set(parts)].slice(0, 3).join(" · ") : null;
}

export function jobPostingToNormalized(node: Obj, pageUrl: string, fallbackCompany?: string): NormalizedJob | null {
  const title = str(node.title) ?? str(node.name);
  if (!title) return null;
  const org = node.hiringOrganization;
  const company = (isObj(org) ? str(org.name) : str(org)) ?? fallbackCompany ?? new URL(pageUrl).hostname;
  const sameAs = isObj(org) ? str(org.sameAs) ?? str(org.url) : null;
  let domain: string | null = null;
  try { if (sameAs) domain = new URL(sameAs).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
  const validThrough = str(node.validThrough);
  if (validThrough && !isNaN(Date.parse(validThrough)) && Date.parse(validThrough) < Date.now()) return null;
  const location = locationText(node.jobLocation);
  const remote = String(node.jobLocationType ?? "").toUpperCase() === "TELECOMMUTE" || (isObj(node.applicantLocationRequirements) && !location);
  const et = node.employmentType;
  const etRaw = Array.isArray(et) ? et[0] : et;
  const etKey = etRaw ? String(etRaw).toUpperCase().replace(/[\s-]/g, "_") : "";
  let salaryMin: number | null = null, salaryMax: number | null = null, currency: string | null = null, period: NormalizedJob["salaryPeriod"] = null;
  const bs = node.baseSalary;
  if (isObj(bs)) {
    currency = str(bs.currency);
    const v = isObj(bs.value) ? bs.value : bs;
    const min = Number(v.minValue ?? v.value), max = Number(v.maxValue ?? v.value);
    if (Number.isFinite(min)) salaryMin = Math.round(min);
    if (Number.isFinite(max)) salaryMax = Math.round(max);
    const unit = String(v.unitText ?? "").toUpperCase();
    period = unit === "HOUR" ? "hour" : unit === "MONTH" ? "month" : unit === "YEAR" ? "year" : salaryMin && salaryMin < 500 ? "hour" : "year";
  }
  const ident = node.identifier;
  const externalId = (isObj(ident) ? str(ident.value) : str(ident)) ?? createHash("sha1").update(str(node.url) ?? pageUrl).digest("hex");
  const description = stripHtml(String(node.description ?? "")).trim();
  if (description.length < 40) return null;
  return {
    externalId, title, company, companyDomain: domain, description, location, isRemote: remote,
    employmentType: EMPLOYMENT[etKey] ?? undefined, applyUrl: str(node.url) ?? pageUrl, postedAt: str(node.datePosted),
    salaryMin, salaryMax, salaryCurrency: currency, salaryPeriod: period, raw: { source: "json-ld", page: pageUrl, industry: str(node.industry) },
  };
}

export function extractJobPostings(html: string, pageUrl: string, fallbackCompany?: string): NormalizedJob[] {
  const nodes: Obj[] = [];
  for (const block of jsonLdBlocks(html)) collect(block, nodes);
  const out: NormalizedJob[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    const j = jobPostingToNormalized(n, pageUrl, fallbackCompany);
    if (j && !seen.has(j.externalId)) { seen.add(j.externalId); out.push(j); }
  }
  return out;
}
