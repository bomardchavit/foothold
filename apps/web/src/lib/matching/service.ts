import type { Job, Company, CandidateProfile } from "@prisma/client";
import { scoreMatch, industryForDomain, stripEmployerSkills, type ScoreJobInput, type MatchBreakdown, type ScoreProfileInput } from "@foothold/shared";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { toScoreProfile } from "../profile/service";

export type JobWithCompany = Job & { company: Company };

/** The industry we trust for a job: a curated employer entry beats the keyword guess stored on the row. */
export function jobIndustry(job: JobWithCompany): { industry: string | null; confidence: "known" | "inferred" } {
  const known = industryForDomain(job.company.domain);
  if (known) return { industry: known, confidence: "known" };
  return { industry: job.industry ?? job.company.industry ?? null, confidence: "inferred" };
}

/** Required/preferred skills with the employer's own name removed (older rows were parsed before that filter existed). */
export function jobSkills(job: JobWithCompany): { required: string[]; preferred: string[] } {
  return { required: stripEmployerSkills(job.requiredSkills, job.company.name), preferred: stripEmployerSkills(job.preferredSkills, job.company.name) };
}

export function toScoreJob(job: JobWithCompany): ScoreJobInput {
  const { industry, confidence } = jobIndustry(job);
  const skills = jobSkills(job);
  return {
    title: job.title, requiredSkills: skills.required, preferredSkills: skills.preferred, seniority: job.seniority, employmentType: job.employmentType,
    yearsMin: job.yearsMin, yearsMax: job.yearsMax, industry, industryConfidence: confidence,
    isRemote: job.isRemote, location: job.location, city: job.city, region: job.region, country: job.country,
  };
}

export function computeBreakdown(profile: CandidateProfile & { skills: { name: string }[] }, job: JobWithCompany, cosine: number | null): MatchBreakdown {
  return scoreMatch(toScoreProfile(profile), toScoreJob(job), cosine, profile.embeddingProvider);
}

/** One multi-row INSERT … ON CONFLICT per chunk: a profile save touches every open job, so per-row upserts would mean thousands of round trips. */
export async function upsertMatches(profile: CandidateProfile, rows: Array<{ jobId: string; breakdown: MatchBreakdown }>) {
  const now = new Date();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values = chunk.map(({ jobId, breakdown }) => {
      const c = Object.fromEntries(breakdown.components.map((x) => [x.key, x.score]));
      return Prisma.sql`(${randomUUID()}, ${profile.id}, ${jobId}, ${breakdown.total}, ${c.skills ?? 0}, ${c.semantic ?? 0}, ${c.seniority ?? 0}, ${c.years ?? 0}, ${c.industry ?? 0}, ${c.location ?? 0}, ${JSON.stringify(breakdown)}::jsonb, ${profile.version}, ${now})`;
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MatchScore" ("id", "profileId", "jobId", "total", "skills", "semantic", "seniority", "years", "industry", "location", "breakdownJson", "profileVersion", "computedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("profileId", "jobId") DO UPDATE SET
        "total" = EXCLUDED."total", "skills" = EXCLUDED."skills", "semantic" = EXCLUDED."semantic", "seniority" = EXCLUDED."seniority", "years" = EXCLUDED."years",
        "industry" = EXCLUDED."industry", "location" = EXCLUDED."location", "breakdownJson" = EXCLUDED."breakdownJson", "profileVersion" = EXCLUDED."profileVersion", "computedAt" = EXCLUDED."computedAt"`);
  }
}

export function breakdownFromRow(row: { breakdownJson: unknown }): MatchBreakdown {
  return row.breakdownJson as MatchBreakdown;
}

export type { ScoreProfileInput };
