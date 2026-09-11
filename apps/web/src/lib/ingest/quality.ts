import { hammingDistance } from "@foothold/shared";
import { prisma } from "../db";

export const QUALITY_FLAGS = {
  NO_COMPANY_DOMAIN: "NO_COMPANY_DOMAIN",
  DUPLICATE_ACROSS_COMPANIES: "DUPLICATE_ACROSS_COMPANIES",
  STALE: "STALE",
  SPAM_PATTERN: "SPAM_PATTERN",
  CLOSED: "CLOSED",
} as const;
export const QUALITY_FLAG_LABELS: Record<string, string> = {
  NO_COMPANY_DOMAIN: "No verifiable company website",
  DUPLICATE_ACROSS_COMPANIES: "Same posting under several companies",
  STALE: "Not seen at the source for 2+ weeks",
  SPAM_PATTERN: "Matches known scam patterns",
  CLOSED: "No longer listed by the employer",
};

const DAY = 86400_000;
const SPAM_PATTERNS: RegExp[] = [
  /earn\s+\$?\d[\d,]*\s*(?:per|a|\/)\s*(?:day|week)/i,
  /no experience (?:necessary|needed|required)[\s\S]{0,80}(?:work from home|from home)/i,
  /(?:training|registration|application|starter|activation)\s+fee/i,
  /\b(?:contact|message|text|reach|dm|apply)\s+(?:us|me)\b[^.\n]{0,40}\b(?:whatsapp|telegram)\b|\b(?:whatsapp|telegram)\b[^.\n]{0,15}\+?\d[\d\s()-]{7,}/i,
  /\bmlm\b|multi-?level marketing|network marketing/i,
  /crypto(?:currency)?\s+(?:investment|trading)\s+(?:opportunity|program)/i,
  /guaranteed\s+(?:income|earnings|returns)/i,
  /unlimited earning/i,
  /be your own boss/i,
  /work \d+ hours? (?:a|per) (?:day|week) and (?:earn|make)/i,
  /(?:send|provide) (?:your )?(?:ssn|social security|bank (?:account|details)|copy of (?:your )?(?:id|passport))/i,
  /(?:🚀|💰|💸|🤑|🔥){3,}/,
  /\b(?:western union|gift cards?)\b[\s\S]{0,60}\b(?:payment|paid|reimburse)|\bwire\s+(?:us|me)\s+(?:money|funds|the\s+payment)\b/i,
];

/**
 * Stale = the source stopped listing the posting: not seen for 14 days, or older than 60 days and unconfirmed for a week.
 * A job the last crawl returned is never stale, however old its posted date (age is shown on the card, not hidden).
 * Seed data has no crawl, so it keeps the 60-day age rule.
 */
export function isStale(j: { postedAt: Date | null; lastSeenAt?: Date | null; sourceKind: string }, now = Date.now()): boolean {
  const age = j.postedAt ? now - j.postedAt.getTime() : 0;
  if (j.sourceKind === "SEED") return age > 60 * DAY;
  const unseenFor = j.lastSeenAt ? now - j.lastSeenAt.getTime() : 0; // no lastSeenAt = being ingested right now
  return unseenFor > 14 * DAY || (age > 60 * DAY && unseenFor > 7 * DAY);
}

export function computeQualityFlags(j: { description: string; postedAt: Date | null; lastSeenAt?: Date | null; salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null; companyDomain: string | null; sourceKind: string }): string[] {
  const flags: string[] = [];
  if (!j.companyDomain && (j.sourceKind === "ADZUNA" || j.sourceKind === "SEED")) flags.push(QUALITY_FLAGS.NO_COMPANY_DOMAIN);
  if (isStale(j)) flags.push(QUALITY_FLAGS.STALE);
  const spam = SPAM_PATTERNS.some((rx) => rx.test(j.description))
    || j.description.trim().length < 200
    || (j.salaryMin != null && j.salaryMax != null && j.salaryMin > 0 && j.salaryMax / j.salaryMin > 5)
    || (j.salaryPeriod === "year" && j.salaryMax != null && j.salaryMax > 1_500_000);
  if (spam) flags.push(QUALITY_FLAGS.SPAM_PATTERN);
  return flags;
}

/**
 * Same title + near-identical description under ≥3 companies ⇒ staffing-agency reposts. Peers within 30 days count, and so
 * does any peer already flagged as a repost, so an agency that reposts slowly is still caught.
 */
export async function markCrossCompanyDuplicates(jobIds: string[]) {
  if (!jobIds.length) return;
  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, normalizedTitle: true, fingerprint: true, companyId: true } });
  const since = new Date(Date.now() - 30 * DAY);
  for (const job of jobs) {
    if (!job.fingerprint) continue;
    const peers = await prisma.job.findMany({ where: { normalizedTitle: job.normalizedTitle, OR: [{ firstSeenAt: { gt: since } }, { qualityFlags: { has: QUALITY_FLAGS.DUPLICATE_ACROSS_COMPANIES } }] }, select: { id: true, fingerprint: true, companyId: true, qualityFlags: true } });
    const near = peers.filter((p) => p.fingerprint && hammingDistance(p.fingerprint, job.fingerprint!) <= 3);
    const companies = new Set(near.map((p) => p.companyId));
    if (companies.size >= 3) {
      for (const p of near) {
        if (p.qualityFlags.includes(QUALITY_FLAGS.DUPLICATE_ACROSS_COMPANIES)) continue;
        await prisma.job.update({ where: { id: p.id }, data: { qualityFlags: { push: QUALITY_FLAGS.DUPLICATE_ACROSS_COMPANIES }, isLowQuality: true } });
      }
    }
  }
}

/** Flag jobs that became stale and clear the flag on jobs the source lists again. Returns the number of rows changed. */
export async function refreshStaleFlags(): Promise<number> {
  const now = Date.now();
  const d = (days: number) => new Date(now - days * DAY);
  const candidates = await prisma.job.findMany({
    where: {
      NOT: { qualityFlags: { has: QUALITY_FLAGS.STALE } },
      OR: [
        { source: { kind: "SEED" }, postedAt: { lt: d(60) } },
        // A board we only ever read the newest slice of (a Workday tenant with thousands of postings) cannot tell us
        // that an older posting is gone, so its rows are never called stale on that evidence.
        { source: { kind: { not: "SEED" }, lastIndexComplete: true }, OR: [{ lastSeenAt: { lt: d(14) } }, { postedAt: { lt: d(60) }, lastSeenAt: { lt: d(7) } }] },
      ],
    },
    select: { id: true, postedAt: true, lastSeenAt: true, source: { select: { kind: true } } },
  });
  let changed = 0;
  for (const j of candidates) {
    if (!isStale({ postedAt: j.postedAt, lastSeenAt: j.lastSeenAt, sourceKind: j.source.kind }, now)) continue;
    await prisma.job.update({ where: { id: j.id }, data: { qualityFlags: { push: QUALITY_FLAGS.STALE }, isLowQuality: true } });
    changed++;
  }
  const flagged = await prisma.job.findMany({
    where: { qualityFlags: { has: QUALITY_FLAGS.STALE }, source: { kind: { not: "SEED" } }, lastSeenAt: { gte: d(14) } },
    select: { id: true, postedAt: true, lastSeenAt: true, qualityFlags: true, source: { select: { kind: true } } },
  });
  for (const j of flagged) {
    if (isStale({ postedAt: j.postedAt, lastSeenAt: j.lastSeenAt, sourceKind: j.source.kind }, now)) continue;
    const qualityFlags = j.qualityFlags.filter((f) => f !== QUALITY_FLAGS.STALE);
    await prisma.job.update({ where: { id: j.id }, data: { qualityFlags, isLowQuality: qualityFlags.length > 0 } });
    changed++;
  }
  return changed;
}
