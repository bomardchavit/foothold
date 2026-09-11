import { Prisma, type H1bSignal, type Seniority } from "@prisma/client";
import { prisma } from "../db";

export interface FeedFilters {
  min: number; posted: number | null; loc: string; remote: boolean; seniority: Seniority[]; industry: string[]; salary: number | null; h1b: H1bSignal[]; q: string; lowq: boolean; page: number; sort: "fit" | "newest";
}
const SEN = new Set(["INTERN", "ENTRY", "MID", "SENIOR", "STAFF", "PRINCIPAL", "MANAGER", "DIRECTOR", "EXECUTIVE", "UNKNOWN"]);
const H1B = new Set(["YES", "LIKELY", "UNKNOWN"]);
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);

export function parseFeedFilters(sp: Record<string, string | string[] | undefined>): FeedFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  return {
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
  };
}

export function feedWhere(profileId: string, f: FeedFilters): Prisma.MatchScoreWhereInput {
  const job: Prisma.JobWhereInput = {};
  if (!f.lowq) job.isLowQuality = false;
  if (f.posted) job.postedAt = { gte: new Date(Date.now() - f.posted * 86400_000) };
  if (f.remote) job.isRemote = true;
  if (f.seniority.length) job.seniority = { in: f.seniority };
  if (f.industry.length) job.industry = { in: f.industry };
  if (f.salary) job.OR = [{ salaryMax: { gte: f.salary } }, { salaryMin: { gte: f.salary } }];
  if (f.h1b.length) job.company = { h1bSignal: { in: f.h1b } };
  if (f.loc) job.AND = [{ OR: [{ location: { contains: f.loc, mode: "insensitive" } }, { city: { contains: f.loc, mode: "insensitive" } }, { region: { equals: f.loc.toUpperCase() } }, ...(/remote/i.test(f.loc) ? [{ isRemote: true }] : [])] }];
  if (f.q) job.AND = [...((job.AND as Prisma.JobWhereInput[]) ?? []), { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { company: { name: { contains: f.q, mode: "insensitive" } } }, { requiredSkills: { has: f.q } }] }];
  return { profileId, total: { gte: f.min }, job };
}

export const matchInclude = { job: { include: { company: true } } } satisfies Prisma.MatchScoreInclude;
export type MatchRow = Prisma.MatchScoreGetPayload<{ include: typeof matchInclude }>;

export async function queryFeed(profileId: string, f: FeedFilters, pageSize = 30) {
  const where = feedWhere(profileId, f);
  const orderBy: Prisma.MatchScoreOrderByWithRelationInput[] = f.sort === "newest" ? [{ job: { postedAt: "desc" } }, { total: "desc" }] : [{ total: "desc" }, { job: { postedAt: "desc" } }];
  const [rows, count, hidden] = await Promise.all([
    prisma.matchScore.findMany({ where, include: matchInclude, orderBy, skip: (f.page - 1) * pageSize, take: pageSize }),
    prisma.matchScore.count({ where }),
    f.lowq ? Promise.resolve(0) : prisma.matchScore.count({ where: { ...where, job: { ...(where.job as Prisma.JobWhereInput), isLowQuality: true } } }),
  ]);
  return { rows, count, hidden, pageSize };
}

export async function newSinceLastVisit(profileId: string, since: Date | null, take = 10): Promise<MatchRow[]> {
  return prisma.matchScore.findMany({
    where: { profileId, job: { isLowQuality: false, firstSeenAt: { gt: since ?? new Date(Date.now() - 7 * 86400_000) } } },
    include: matchInclude, orderBy: [{ total: "desc" }], take,
  });
}
