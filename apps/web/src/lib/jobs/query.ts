import { Prisma, type H1bSignal, type Seniority, type EmploymentType, type WorkplaceType } from "@prisma/client";
import { prisma } from "../db";

export type FeedTab = "recommended" | "liked" | "applied" | "external";
export interface FeedFilters {
  tab: FeedTab; min: number; posted: number | null; loc: string; remote: boolean; seniority: Seniority[]; industry: string[]; salary: number | null; h1b: H1bSignal[]; q: string; lowq: boolean; page: number; sort: "fit" | "newest";
  type: EmploymentType[]; work: WorkplaceType[]; roles: string[]; years: string; hidden: boolean;
}
const SEN = new Set(["INTERN", "ENTRY", "MID", "SENIOR", "STAFF", "PRINCIPAL", "MANAGER", "DIRECTOR", "EXECUTIVE", "UNKNOWN"]);
const H1B = new Set(["YES", "LIKELY", "UNKNOWN"]);
const TYPES = new Set(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY", "UNKNOWN"]);
const WORK = new Set(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]);
export const YEARS_BUCKETS: Array<[string, string, number, number | null]> = [["0-1", "0–1 years", 0, 1], ["1-3", "1–3 years", 1, 3], ["3-5", "3–5 years", 3, 5], ["5-10", "5–10 years", 5, 10], ["10+", "10+ years", 10, null]];
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);

export function parseFeedFilters(sp: Record<string, string | string[] | undefined>): FeedFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  const tab = (["recommended", "liked", "applied", "external"] as const).find((t) => t === one("tab")) ?? "recommended";
  return {
    tab,
    min: Math.max(0, Math.min(100, Number(one("min")) || 0)),
    posted: one("posted") ? Number(one("posted")) || null : null,
    loc: one("loc").slice(0, 80),
    remote: one("remote") === "1",
    seniority: list(sp.seniority).filter((s) => SEN.has(s)) as Seniority[],
    industry: list(sp.industry),
    salary: one("salary") ? Number(one("salary")) || null : null,
    h1b: list(sp.h1b).filter((s) => H1B.has(s)) as H1bSignal[],
    q: one("q").slice(0, 80),
    lowq: one("lowq") === "1",
    page: Math.max(1, Number(one("page")) || 1),
    sort: one("sort") === "newest" ? "newest" : "fit",
    type: list(sp.type).filter((s) => TYPES.has(s)) as EmploymentType[],
    work: list(sp.work).filter((s) => WORK.has(s)) as WorkplaceType[],
    roles: list(sp.roles).slice(0, 10),
    years: YEARS_BUCKETS.some((b) => b[0] === one("years")) ? one("years") : "",
    hidden: one("hidden") === "1",
  };
}

/** Serialize filters back to URL params (only non-defaults). */
export function filtersToParams(f: Partial<FeedFilters>): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.tab && f.tab !== "recommended") p.tab = f.tab;
  if (f.min) p.min = String(f.min);
  if (f.posted) p.posted = String(f.posted);
  if (f.loc) p.loc = f.loc;
  if (f.remote) p.remote = "1";
  if (f.seniority?.length) p.seniority = f.seniority.join(",");
  if (f.industry?.length) p.industry = f.industry.join(",");
  if (f.salary) p.salary = String(f.salary);
  if (f.h1b?.length) p.h1b = f.h1b.join(",");
  if (f.q) p.q = f.q;
  if (f.lowq) p.lowq = "1";
  if (f.sort && f.sort !== "fit") p.sort = f.sort;
  if (f.type?.length) p.type = f.type.join(",");
  if (f.work?.length) p.work = f.work.join(",");
  if (f.roles?.length) p.roles = f.roles.join(",");
  if (f.years) p.years = f.years;
  if (f.hidden) p.hidden = "1";
  if (f.page && f.page > 1) p.page = String(f.page);
  return p;
}

export function isDefaultFilters(f: FeedFilters): boolean {
  return f.page === 1 && !f.q && !f.loc && !f.remote && !f.seniority.length && !f.industry.length && !f.salary && !f.h1b.length && f.min === 0 && !f.posted && !f.type.length && !f.work.length && !f.roles.length && !f.years && !f.hidden && f.tab === "recommended";
}

export function feedWhere(profileId: string, userId: string, f: FeedFilters): Prisma.MatchScoreWhereInput {
  const job: Prisma.JobWhereInput = {};
  const and: Prisma.JobWhereInput[] = [];
  if (!f.lowq) job.isLowQuality = false;
  if (f.posted) job.postedAt = { gte: new Date(Date.now() - f.posted * 86400_000) };
  if (f.remote) job.isRemote = true;
  if (f.seniority.length) job.seniority = { in: f.seniority };
  if (f.industry.length) job.industry = { in: f.industry };
  if (f.type.length) job.employmentType = { in: f.type };
  if (f.work.length) job.workplaceType = { in: f.work };
  if (f.salary) and.push({ OR: [{ salaryMax: { gte: f.salary } }, { salaryMin: { gte: f.salary } }] });
  if (f.h1b.length) job.company = { h1bSignal: { in: f.h1b } };
  if (f.loc) and.push({ OR: [{ location: { contains: f.loc, mode: "insensitive" } }, { city: { contains: f.loc, mode: "insensitive" } }, { region: { equals: f.loc.toUpperCase() } }, ...(/remote/i.test(f.loc) ? [{ isRemote: true }] : []), ...(/united states|^us$|usa/i.test(f.loc) ? [{ country: "US" }] : [])] });
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { company: { name: { contains: f.q, mode: "insensitive" } } }, { requiredSkills: { has: f.q } }] });
  if (f.roles.length) and.push({ OR: f.roles.map((r) => ({ title: { contains: r.split(/\s+/).slice(-1)[0] ?? r, mode: "insensitive" as const } })) });
  if (f.years) {
    const b = YEARS_BUCKETS.find((x) => x[0] === f.years)!;
    and.push({ OR: [{ yearsMin: null }, { AND: [{ yearsMin: { lte: b[3] ?? 99 } }, { OR: [{ yearsMax: null }, { yearsMax: { gte: b[2] } }] }] }] });
  }
  // tab scoping
  if (f.tab === "liked") and.push({ applications: { some: { userId, status: "SAVED" } } });
  if (f.tab === "applied") and.push({ applications: { some: { userId, status: { in: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"] } } } });
  if (f.tab === "external") and.push({ source: { kind: "MANUAL" }, applications: { some: { userId } } });
  // hidden jobs
  and.push(f.hidden ? { hiddenBy: { some: { userId } } } : { hiddenBy: { none: { userId } } });
  if (and.length) job.AND = and;
  return { profileId, total: { gte: f.min }, job };
}

export const matchInclude = { job: { include: { company: true, source: { select: { kind: true } } } } } satisfies Prisma.MatchScoreInclude;
export type MatchRow = Prisma.MatchScoreGetPayload<{ include: typeof matchInclude }>;

export async function queryFeed(profileId: string, userId: string, f: FeedFilters, pageSize = 20) {
  const where = feedWhere(profileId, userId, f);
  const orderBy: Prisma.MatchScoreOrderByWithRelationInput[] = f.sort === "newest" ? [{ job: { postedAt: "desc" } }, { total: "desc" }] : [{ total: "desc" }, { job: { postedAt: "desc" } }];
  const [rows, count, hidden] = await Promise.all([
    prisma.matchScore.findMany({ where, include: matchInclude, orderBy, skip: (f.page - 1) * pageSize, take: pageSize }),
    prisma.matchScore.count({ where }),
    f.lowq ? Promise.resolve(0) : prisma.matchScore.count({ where: { ...where, job: { ...(where.job as Prisma.JobWhereInput), isLowQuality: true } } }),
  ]);
  return { rows, count, hidden, pageSize };
}

export async function tabCounts(profileId: string, userId: string) {
  const [liked, applied, external, hiddenCount] = await Promise.all([
    prisma.application.count({ where: { userId, status: "SAVED" } }),
    prisma.application.count({ where: { userId, status: { in: ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"] } } }),
    prisma.application.count({ where: { userId, job: { source: { kind: "MANUAL" } } } }),
    prisma.hiddenJob.count({ where: { userId } }),
  ]);
  void profileId;
  return { liked, applied, external, hidden: hiddenCount };
}

/** Per-company counts of the user's contacts (school alumni vs any connection). */
export async function connectionCounts(userId: string, companyNormalizedNames: string[]): Promise<Map<string, { alumni: number; connections: number }>> {
  if (!companyNormalizedNames.length) return new Map();
  const [contacts, profile] = await Promise.all([
    prisma.contact.findMany({ where: { userId, OR: [{ normalizedCompany: { in: companyNormalizedNames } }, { normalizedPastCompanies: { hasSome: companyNormalizedNames } }] }, select: { normalizedCompany: true, normalizedPastCompanies: true, schools: true } }),
    prisma.candidateProfile.findUnique({ where: { userId }, include: { educations: { select: { school: true } } } }),
  ]);
  const mySchools = new Set((profile?.educations ?? []).map((e) => e.school.toLowerCase().trim()));
  const out = new Map<string, { alumni: number; connections: number }>();
  for (const c of contacts) {
    const companies = new Set([c.normalizedCompany, ...c.normalizedPastCompanies].filter((x): x is string => Boolean(x)));
    const alum = c.schools.some((s) => mySchools.has(s.toLowerCase().trim()));
    for (const n of companies) {
      if (!companyNormalizedNames.includes(n)) continue;
      const e = out.get(n) ?? { alumni: 0, connections: 0 };
      e.connections++; if (alum) e.alumni++;
      out.set(n, e);
    }
  }
  return out;
}

export async function newSinceLastVisit(profileId: string, since: Date | null, take = 10): Promise<MatchRow[]> {
  return prisma.matchScore.findMany({ where: { profileId, job: { isLowQuality: false, firstSeenAt: { gt: since ?? new Date(Date.now() - 7 * 86400_000) } } }, include: matchInclude, orderBy: [{ total: "desc" }], take });
}
