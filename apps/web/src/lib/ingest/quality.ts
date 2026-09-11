import { hammingDistance } from "@foothold/shared";
import { prisma } from "../db";

export const QUALITY_FLAGS = {
  NO_COMPANY_DOMAIN: "NO_COMPANY_DOMAIN",
  DUPLICATE_ACROSS_COMPANIES: "DUPLICATE_ACROSS_COMPANIES",
  STALE: "STALE",
  SPAM_PATTERN: "SPAM_PATTERN",
} as const;
export const QUALITY_FLAG_LABELS: Record<string, string> = {
  NO_COMPANY_DOMAIN: "No verifiable company website",
  DUPLICATE_ACROSS_COMPANIES: "Same posting under several companies",
  STALE: "Older than 60 days",
  SPAM_PATTERN: "Matches known scam patterns",
};

const SPAM_PATTERNS: RegExp[] = [
  /earn\s+\$?\d[\d,]*\s*(?:per|a|\/)\s*(?:day|week)/i,
  /no experience (?:necessary|needed|required)[\s\S]{0,80}(?:work from home|from home)/i,
  /(?:training|registration|application|processing|starter|activation)\s+fee/i,
  /\b(?:whatsapp|telegram)\b/i,
  /\bmlm\b|multi-?level marketing|network marketing/i,
  /crypto(?:currency)?\s+(?:investment|trading)\s+(?:opportunity|program)/i,
  /guaranteed\s+(?:income|earnings|returns)/i,
  /unlimited earning/i,
  /be your own boss/i,
  /work \d+ hours? (?:a|per) (?:day|week) and (?:earn|make)/i,
  /(?:send|provide) (?:your )?(?:ssn|social security|bank (?:account|details)|copy of (?:your )?(?:id|passport))/i,
  /(?:🚀|💰|💸|🤑|🔥){3,}/,
  /\b(?:wire|western union|gift cards?)\b[\s\S]{0,60}\b(?:payment|paid|reimburse)/i,
];

export function computeQualityFlags(j: { description: string; postedAt: Date | null; salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null; companyDomain: string | null; sourceKind: string }): string[] {
  const flags: string[] = [];
  if (!j.companyDomain && (j.sourceKind === "ADZUNA" || j.sourceKind === "SEED")) flags.push(QUALITY_FLAGS.NO_COMPANY_DOMAIN);
  if (j.postedAt && Date.now() - j.postedAt.getTime() > 60 * 86400_000) flags.push(QUALITY_FLAGS.STALE);
  const spam = SPAM_PATTERNS.some((rx) => rx.test(j.description))
    || j.description.trim().length < 200
    || (j.salaryMin != null && j.salaryMax != null && j.salaryMin > 0 && j.salaryMax / j.salaryMin > 5)
    || (j.salaryPeriod === "year" && j.salaryMax != null && j.salaryMax > 1_500_000);
  if (spam) flags.push(QUALITY_FLAGS.SPAM_PATTERN);
  return flags;
}

/** Same title + near-identical description under ≥3 companies in 30 days ⇒ staffing-agency reposts. */
export async function markCrossCompanyDuplicates(jobIds: string[]) {
  if (!jobIds.length) return;
  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, normalizedTitle: true, fingerprint: true, companyId: true } });
  const since = new Date(Date.now() - 30 * 86400_000);
  for (const job of jobs) {
    if (!job.fingerprint) continue;
    const peers = await prisma.job.findMany({ where: { normalizedTitle: job.normalizedTitle, firstSeenAt: { gt: since } }, select: { id: true, fingerprint: true, companyId: true, qualityFlags: true } });
    const near = peers.filter((p) => p.fingerprint && hammingDistance(p.fingerprint, job.fingerprint!) <= 3);
    const companies = new Set(near.map((p) => p.companyId));
    if (companies.size >= 3) {
      const ids = near.map((p) => p.id);
      for (const p of near) {
        if (p.qualityFlags.includes(QUALITY_FLAGS.DUPLICATE_ACROSS_COMPANIES)) continue;
        await prisma.job.update({ where: { id: p.id }, data: { qualityFlags: { push: QUALITY_FLAGS.DUPLICATE_ACROSS_COMPANIES }, isLowQuality: true } });
      }
      void ids;
    }
  }
}

export async function refreshStaleFlags() {
  const cutoff = new Date(Date.now() - 60 * 86400_000);
  const stale = await prisma.job.findMany({ where: { postedAt: { lt: cutoff }, NOT: { qualityFlags: { has: QUALITY_FLAGS.STALE } } }, select: { id: true } });
  for (const s of stale) await prisma.job.update({ where: { id: s.id }, data: { qualityFlags: { push: QUALITY_FLAGS.STALE }, isLowQuality: true } });
  return stale.length;
}
