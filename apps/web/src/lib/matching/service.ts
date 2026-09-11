import type { Job, Company, CandidateProfile } from "@prisma/client";
import { scoreMatch, type ScoreJobInput, type MatchBreakdown, type ScoreProfileInput } from "@foothold/shared";
import { prisma } from "../db";
import { toScoreProfile } from "../profile/service";

export type JobWithCompany = Job & { company: Company };

export function toScoreJob(job: JobWithCompany): ScoreJobInput {
  return {
    title: job.title, requiredSkills: job.requiredSkills, preferredSkills: job.preferredSkills, seniority: job.seniority,
    yearsMin: job.yearsMin, yearsMax: job.yearsMax, industry: job.industry ?? job.company.industry ?? null,
    isRemote: job.isRemote, location: job.location, city: job.city, region: job.region, country: job.country,
  };
}

export function computeBreakdown(profile: CandidateProfile & { skills: { name: string }[] }, job: JobWithCompany, cosine: number | null): MatchBreakdown {
  return scoreMatch(toScoreProfile(profile), toScoreJob(job), cosine, profile.embeddingProvider);
}

export async function upsertMatches(profile: CandidateProfile, rows: Array<{ jobId: string; breakdown: MatchBreakdown }>) {
  const chunks: typeof rows[] = [];
  for (let i = 0; i < rows.length; i += 50) chunks.push(rows.slice(i, i + 50));
  for (const chunk of chunks) {
    await prisma.$transaction(chunk.map(({ jobId, breakdown }) => {
      const c = Object.fromEntries(breakdown.components.map((x) => [x.key, x.score]));
      const data = {
        total: breakdown.total, skills: c.skills ?? 0, semantic: c.semantic ?? 0, seniority: c.seniority ?? 0, years: c.years ?? 0, industry: c.industry ?? 0, location: c.location ?? 0,
        breakdownJson: breakdown as object, profileVersion: profile.version, computedAt: new Date(),
      };
      return prisma.matchScore.upsert({ where: { profileId_jobId: { profileId: profile.id, jobId } }, create: { profileId: profile.id, jobId, ...data }, update: data });
    }));
  }
}

export function breakdownFromRow(row: { breakdownJson: unknown }): MatchBreakdown {
  return row.breakdownJson as MatchBreakdown;
}

export type { ScoreProfileInput };
