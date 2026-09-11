import { Prisma, type H1bSignal } from "@prisma/client";
import { prisma } from "../db";

/** USCIS fiscal years run Oct–Sep; FY2026 started Oct 2025. */
export function currentFiscalYear(now = new Date()): number {
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export interface H1bResult { signal: H1bSignal; matchedName: string | null; approvals: number; years: number[] }

export async function computeH1bSignal(normalizedName: string): Promise<H1bResult> {
  const minFy = currentFiscalYear() - 3; // approvals within the last three fiscal years
  if (!normalizedName) return { signal: "UNKNOWN", matchedName: null, approvals: 0, years: [] };
  const exact = await prisma.$queryRaw<Array<{ employerName: string; approvals: number; years: number[] }>>(Prisma.sql`
    SELECT "employerName", SUM("initialApprovals" + "continuingApprovals")::int AS approvals, array_agg(DISTINCT "fiscalYear") AS years
    FROM "H1bEmployer" WHERE "normalizedName" = ${normalizedName} AND "fiscalYear" >= ${minFy}
    GROUP BY "employerName" ORDER BY approvals DESC LIMIT 1`);
  if (exact[0] && exact[0].approvals > 0) return { signal: "YES", matchedName: exact[0].employerName, approvals: exact[0].approvals, years: exact[0].years.sort() };
  const fuzzy = await prisma.$queryRaw<Array<{ employerName: string; sim: number; approvals: number; years: number[] }>>(Prisma.sql`
    SELECT "employerName", similarity("normalizedName", ${normalizedName})::float8 AS sim, SUM("initialApprovals" + "continuingApprovals")::int AS approvals, array_agg(DISTINCT "fiscalYear") AS years
    FROM "H1bEmployer"
    WHERE "fiscalYear" >= ${minFy} AND ("normalizedName" % ${normalizedName} OR "normalizedName" LIKE ${normalizedName + " %"})
    GROUP BY "employerName", "normalizedName" HAVING SUM("initialApprovals" + "continuingApprovals") > 0
    ORDER BY sim DESC, approvals DESC LIMIT 1`);
  if (fuzzy[0] && (fuzzy[0].sim >= 0.6 || fuzzy[0].employerName.toLowerCase().startsWith(normalizedName + " "))) {
    return { signal: "LIKELY", matchedName: fuzzy[0].employerName, approvals: fuzzy[0].approvals, years: fuzzy[0].years.sort() };
  }
  return { signal: "UNKNOWN", matchedName: null, approvals: 0, years: [] };
}

export async function refreshCompanySignal(companyId: string) {
  const c = await prisma.company.findUnique({ where: { id: companyId } });
  if (!c) return;
  const r = await computeH1bSignal(c.normalizedName);
  await prisma.company.update({ where: { id: companyId }, data: { h1bSignal: r.signal, h1bMatchedName: r.matchedName, h1bApprovals: r.approvals, h1bYears: r.years } });
}

export async function refreshAllCompanySignals() {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const c of companies) await refreshCompanySignal(c.id);
  return companies.length;
}
