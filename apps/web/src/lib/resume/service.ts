import type { ResumeContent } from "@foothold/shared";
import { prisma } from "../db";
import { getFullProfile } from "../profile/service";
import { breakdownFromRow, computeBreakdown, upsertMatches } from "../matching/service";
import { cosineForJobs } from "../vectors";
import { buildBaseContent, diffStats } from "./build";
import { tailorResume } from "./tailor";
import { computeKeywordGaps } from "./gaps";
import { track } from "../analytics/server";
import { EVENTS } from "../analytics/events";

export async function createBaseResume(userId: string) {
  const profile = await getFullProfile(userId);
  if (!profile) throw new Error("No profile");
  const content = buildBaseContent(profile);
  return prisma.resumeDocument.create({ data: { userId, kind: "BASE", title: `${profile.fullName ?? "My"} résumé`, contentJson: content as object, diffJson: { stats: diffStats(content), decisions: {} }, validationJson: { mode: "none", issues: [] } } });
}

export async function createTailoredResume(userId: string, jobId: string) {
  const profile = await getFullProfile(userId);
  if (!profile) throw new Error("No profile");
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) throw new Error("Job not found");
  let m = await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId } } });
  if (!m) { const cos = (await cosineForJobs(profile.id, [jobId])).get(jobId) ?? null; await upsertMatches(profile, [{ jobId, breakdown: computeBreakdown(profile, job, cos) }]); m = await prisma.matchScore.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId } } }); }
  const breakdown = m ? breakdownFromRow(m) : null;
  const started = Date.now();
  const { content, validation } = await tailorResume(profile, job, breakdown, userId);
  const gaps = await computeKeywordGaps(profile, job);
  const stats = diffStats(content);
  const doc = await prisma.resumeDocument.create({
    data: { userId, kind: "TAILORED", jobId, title: `${job.title} at ${job.company.name}`, contentJson: content as object, diffJson: { stats, decisions: {} }, gapsJson: gaps as object[], validationJson: validation as object },
  });
  track(userId, EVENTS.resume_tailored, { jobId, documentId: doc.id, mode: validation.mode, reworded: stats.reworded, expanded: stats.expanded, added: stats.added, ms: Date.now() - started });
  return doc;
}

export function contentOf(doc: { contentJson: unknown }): ResumeContent { return doc.contentJson as ResumeContent; }
export function decisionsOf(doc: { diffJson: unknown }): Record<string, boolean> { return ((doc.diffJson as { decisions?: Record<string, boolean> } | null)?.decisions) ?? {}; }
