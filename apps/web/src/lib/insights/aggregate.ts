import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export interface SkillCount { skill: string; count: number; required: number }

/** Skills that appear most across the candidate's top-100 matches but are absent from the profile. */
export async function topSkillGaps(profileId: string, limit = 20): Promise<{ gaps: SkillCount[]; have: SkillCount[]; sampleSize: number }> {
  const top = await prisma.matchScore.findMany({ where: { profileId, job: { isLowQuality: false } }, orderBy: { total: "desc" }, take: 100, select: { job: { select: { requiredSkills: true, preferredSkills: true } } } });
  const profile = await prisma.candidateProfile.findUnique({ where: { id: profileId }, include: { skills: true } });
  const have = new Set((profile?.skills ?? []).map((s) => s.canonical));
  const counts = new Map<string, SkillCount>();
  for (const m of top) {
    for (const s of new Set([...m.job.requiredSkills, ...m.job.preferredSkills])) {
      const c = counts.get(s) ?? { skill: s, count: 0, required: 0 };
      c.count++; if (m.job.requiredSkills.includes(s)) c.required++;
      counts.set(s, c);
    }
  }
  const all = [...counts.values()].sort((a, b) => b.count - a.count);
  return { gaps: all.filter((c) => !have.has(c.skill.toLowerCase())).slice(0, limit), have: all.filter((c) => have.has(c.skill.toLowerCase())).slice(0, limit), sampleSize: top.length };
}

export async function componentAverages(profileId: string) {
  const rows = await prisma.$queryRaw<Array<{ skills: number; semantic: number; seniority: number; years: number; industry: number; location: number; total: number; n: number }>>(Prisma.sql`
    SELECT AVG(skills)::float8 AS skills, AVG(semantic)::float8 AS semantic, AVG(seniority)::float8 AS seniority, AVG(years)::float8 AS years, AVG(industry)::float8 AS industry, AVG(location)::float8 AS location, AVG(total)::float8 AS total, COUNT(*)::int AS n
    FROM (SELECT * FROM "MatchScore" WHERE "profileId" = ${profileId} ORDER BY total DESC LIMIT 100) t`);
  return rows[0];
}

export async function fitDistribution(profileId: string): Promise<Array<{ bucket: string; count: number }>> {
  const rows = await prisma.$queryRaw<Array<{ bucket: number; count: number }>>(Prisma.sql`
    SELECT (total / 10) * 10 AS bucket, COUNT(*)::int AS count FROM "MatchScore" m JOIN "Job" j ON j.id = m."jobId"
    WHERE m."profileId" = ${profileId} AND j."isLowQuality" = false GROUP BY 1 ORDER BY 1`);
  return rows.map((r) => ({ bucket: `${r.bucket}–${Math.min(100, r.bucket + 9)}`, count: r.count }));
}
