import { prisma } from "../db";
import { matchInclude, type MatchRow } from "./query";

/** "software engineer, backend" → "software engineer"; "product manager" → "product manager"; "designer" → "designer". */
export function titleFamily(normalizedTitle: string): string {
  const words = normalizedTitle.replace(/[,(/].*$/, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(-2).join(" ") || normalizedTitle;
}

/** Other roles in the same title family, ranked by this profile's fit; skips hidden and low-quality listings. */
export async function similarRoles(profileId: string, userId: string, job: { id: string; normalizedTitle: string }, take = 3): Promise<MatchRow[]> {
  const family = titleFamily(job.normalizedTitle);
  return prisma.matchScore.findMany({
    where: { profileId, jobId: { not: job.id }, job: { isLowQuality: false, closedAt: null, hiddenBy: { none: { userId } }, OR: [{ normalizedTitle: job.normalizedTitle }, { normalizedTitle: { contains: family } }] } },
    include: matchInclude,
    orderBy: [{ total: "desc" }, { job: { postedAt: "desc" } }],
    take,
  });
}
