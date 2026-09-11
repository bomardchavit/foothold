import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import { normalizeCompanyName } from "@foothold/shared";
import { prisma } from "../db";

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const num = (v: unknown) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : 0; };

/**
 * Load a USCIS H-1B Employer Data Hub export (CSV) — https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub
 * Expected columns: Fiscal Year, Employer (Petitioner) Name, Petitioner City, Petitioner State, Initial Approval, Initial Denial, Continuing Approval, Continuing Denial.
 */
export async function loadH1bCsv(filePath: string, { replaceYears = true }: { replaceYears?: boolean } = {}): Promise<{ rows: number; years: number[] }> {
  const text = await readFile(filePath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: key });
  const rows = parsed.data.map((r) => ({
    fiscalYear: num(r.fiscalyear ?? r.fy ?? r.year),
    employerName: (r.employerpetitionername ?? r.employer ?? r.employername ?? "").trim(),
    city: (r.petitionercity ?? r.city ?? "").trim() || null,
    state: (r.petitionerstate ?? r.state ?? "").trim() || null,
    initialApprovals: num(r.initialapproval ?? r.initialapprovals),
    initialDenials: num(r.initialdenial ?? r.initialdenials),
    continuingApprovals: num(r.continuingapproval ?? r.continuingapprovals),
    continuingDenials: num(r.continuingdenial ?? r.continuingdenials),
  })).filter((r) => r.employerName && r.fiscalYear > 2000);
  const years = [...new Set(rows.map((r) => r.fiscalYear))].sort();
  if (replaceYears && years.length) await prisma.h1bEmployer.deleteMany({ where: { fiscalYear: { in: years } } });
  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.h1bEmployer.createMany({ data: rows.slice(i, i + 1000).map((r) => ({ ...r, normalizedName: normalizeCompanyName(r.employerName) })) });
  }
  return { rows: rows.length, years };
}
