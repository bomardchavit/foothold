import Link from "next/link";
import { Building2, Users, Globe, Briefcase, ShieldCheck } from "lucide-react";
import type { Company } from "@prisma/client";
import { COMPANY_SIZE_LABELS } from "@foothold/shared";
import { prisma } from "@/lib/db";
import { companyHasLogo } from "@/lib/jobs/logo";
import { CompanyLogo } from "@/components/jobs/workspace/company-logo";

/** What is known about the employer: size, industry, site, H-1B history and how many roles it has open right now. */
export async function CompanyCard({ company }: { company: Company }) {
  const openRoles = await prisma.job.count({ where: { companyId: company.id, closedAt: null, isLowQuality: false } });
  const rows: Array<{ icon: typeof Users; text: React.ReactNode }> = [];
  if (company.size) rows.push({ icon: Users, text: `${COMPANY_SIZE_LABELS[company.size]} employees` });
  if (company.industry) rows.push({ icon: Building2, text: company.industry });
  if (company.domain) rows.push({ icon: Globe, text: <a className="hover:underline" href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer">{company.domain}</a> });
  rows.push({ icon: ShieldCheck, text: company.h1bSignal === "UNKNOWN" ? "No H-1B filings found" : `${company.h1bApprovals} H-1B approvals${company.h1bYears.length ? ` (FY ${company.h1bYears.join(", ")})` : ""}` });
  rows.push({ icon: Briefcase, text: <Link className="hover:underline" href={`/jobs?q=${encodeURIComponent(company.name)}`}>{openRoles} open role{openRoles === 1 ? "" : "s"} in your feed</Link> });
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4" aria-label="About the company" data-testid="company-card">
      <div className="flex items-center gap-3">
        <CompanyLogo companyId={company.id} name={company.name} hasLogo={companyHasLogo(company)} className="h-12 w-12 text-[16px]" />
        <div className="min-w-0"><p className="truncate text-[15px] font-semibold">{company.name}</p><p className="text-[13px] text-muted-foreground">About the company</p></div>
      </div>
      <ul className="mt-3 space-y-1.5 text-[14px]">
        {rows.map((r, i) => <li key={i} className="flex items-center gap-2"><r.icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate">{r.text}</span></li>)}
      </ul>
    </section>
  );
}
