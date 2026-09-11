import { prisma } from "../db";
import { embedTexts } from "../embeddings";
import { setJobEmbedding, setProfileEmbedding, cosineForJobs } from "../vectors";
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

/** Score every open posting for one profile (the feed ranks the whole catalogue, not a nearest-neighbour sample), batched by cursor. */
export async function matchProfileJob({ profileId }: { profileId: string }) {
  const profile = await prisma.candidateProfile.findUnique({ where: { id: profileId }, include: { skills: true } });
  if (!profile) return;
  let cursor: string | undefined;
  for (;;) {
    const jobs = await prisma.job.findMany({
      where: { isLowQuality: false, closedAt: null }, include: { company: true }, orderBy: { id: "asc" }, take: 400,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!jobs.length) break;
    const cosines = await cosineForJobs(profileId, jobs.map((j) => j.id));
    await upsertMatches(profile, jobs.map((job) => ({ jobId: job.id, breakdown: computeBreakdown(profile, job, cosines.get(job.id) ?? null) })));
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < 400) break;
  }
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
