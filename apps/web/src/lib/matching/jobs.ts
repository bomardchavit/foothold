import { prisma } from "../db";
import { embedTexts } from "../embeddings";
import { setJobEmbedding, setProfileEmbedding, nearestJobIdsForProfile, cosineForJobs } from "../vectors";
import { getFullProfile, profileEmbeddingText } from "../profile/service";
import { computeBreakdown, upsertMatches } from "./service";

export async function embedProfileJob({ profileId }: { profileId: string }) {
  const p = await prisma.candidateProfile.findUnique({ where: { id: profileId }, select: { userId: true } });
  if (!p) return;
  const full = await getFullProfile(p.userId);
  if (!full) return;
  const text = profileEmbeddingText(full);
  if (text.trim()) {
    const { vectors, provider } = await embedTexts([text], "query");
    await setProfileEmbedding(profileId, vectors[0], provider);
  }
  await matchProfileJob({ profileId });
}

export async function matchProfileJob({ profileId }: { profileId: string }) {
  const profile = await prisma.candidateProfile.findUnique({ where: { id: profileId }, include: { skills: true } });
  if (!profile) return;
  const nearest = await nearestJobIdsForProfile(profileId, 500);
  const cosines = new Map(nearest.map((n) => [n.id, n.cosine]));
  const ids = new Set(nearest.map((n) => n.id));
  if (ids.size === 0) {
    const recent = await prisma.job.findMany({ where: { isLowQuality: false }, orderBy: { firstSeenAt: "desc" }, take: 500, select: { id: true } });
    for (const r of recent) ids.add(r.id);
  }
  const existing = await prisma.matchScore.findMany({ where: { profileId }, select: { jobId: true } });
  for (const e of existing) ids.add(e.jobId);
  const jobs = await prisma.job.findMany({ where: { id: { in: [...ids] } }, include: { company: true } });
  const missing = jobs.filter((j) => !cosines.has(j.id)).map((j) => j.id);
  for (const [k, v] of await cosineForJobs(profileId, missing)) cosines.set(k, v);
  const rows = jobs.map((job) => ({ jobId: job.id, breakdown: computeBreakdown(profile, job, cosines.get(job.id) ?? null) }));
  await upsertMatches(profile, rows);
}

export async function matchJobsJob({ jobIds }: { jobIds: string[] }) {
  if (!jobIds.length) return;
  const profiles = await prisma.candidateProfile.findMany({ where: { onboardingCompletedAt: { not: null } }, include: { skills: true } });
  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } }, include: { company: true } });
  for (const profile of profiles) {
    const cosines = await cosineForJobs(profile.id, jobIds);
    const rows = jobs.map((job) => ({ jobId: job.id, breakdown: computeBreakdown(profile, job, cosines.get(job.id) ?? null) }));
    await upsertMatches(profile, rows);
  }
}

export async function embedJobsJob({ jobIds }: { jobIds: string[] }) {
  if (!jobIds.length) return;
  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } }, include: { company: { select: { name: true } } } });
  for (let i = 0; i < jobs.length; i += 32) {
    const batch = jobs.slice(i, i + 32);
    const texts = batch.map((j) => `${j.title} at ${j.company.name}\nSkills: ${[...j.requiredSkills, ...j.preferredSkills].join(", ")}\n${j.description.slice(0, 6000)}`);
    const { vectors, provider } = await embedTexts(texts, "document");
    await Promise.all(batch.map((j, k) => setJobEmbedding(j.id, vectors[k], provider)));
  }
}
