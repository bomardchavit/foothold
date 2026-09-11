import { normalizeCompanyName, normalizeText } from "@foothold/shared";
import { prisma } from "../db";
import type { Contact } from "@prisma/client";

export type Insider = Contact & { reasons: string[] };

/** Contacts who work or worked at the company, plus shared school / shared past employer with the candidate. */
export async function findInsiders(userId: string, companyId: string): Promise<Insider[]> {
  const [company, contacts, profile] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.contact.findMany({ where: { userId } }),
    prisma.candidateProfile.findUnique({ where: { userId }, include: { educations: true, experiences: true } }),
  ]);
  if (!company) return [];
  const target = company.normalizedName;
  const mySchools = new Set((profile?.educations ?? []).map((e) => normalizeText(e.school)));
  const myEmployers = new Set((profile?.experiences ?? []).map((e) => normalizeCompanyName(e.company)));
  const out: Insider[] = [];
  for (const c of contacts) {
    const reasons: string[] = [];
    if (c.normalizedCompany === target) reasons.push("Works there now");
    else if (c.normalizedPastCompanies.includes(target)) reasons.push("Worked there");
    else continue;
    for (const s of c.schools) if (mySchools.has(normalizeText(s))) reasons.push(`Same school: ${s}`);
    for (const e of c.normalizedPastCompanies) if (myEmployers.has(e) && e !== target) reasons.push(`Both worked at ${e}`);
    if (c.normalizedCompany && myEmployers.has(c.normalizedCompany) && c.normalizedCompany !== target) reasons.push(`Both worked at ${c.currentCompany}`);
    out.push({ ...c, reasons });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length);
}
