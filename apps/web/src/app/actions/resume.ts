"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canonicalizeSkill, extractSkills, type ResumeContent } from "@foothold/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getFullProfile } from "@/lib/profile/service";
import { contentOf, decisionsOf, createBaseResume } from "@/lib/resume/service";
import { classifyText } from "@/lib/resume/tailor";
import { diffStats } from "@/lib/resume/build";
import { allowedFromProfile } from "@/lib/copilot/grounding";
import { builtFromCurrentProfile } from "@/app/(app)/resumes/freshness";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
type Bullet = ResumeContent["experience"][number]["bullets"][number];

async function ownedDoc(userId: string, id: string) {
  return prisma.resumeDocument.findFirst({ where: { id, userId } });
}
function revalidate(id?: string) { revalidatePath("/resumes"); revalidatePath("/tracker"); if (id) revalidatePath(`/resumes/${id}`); }

/** Reuse the newest base résumé when the profile has not changed since it was built; otherwise build a new one. */
export async function ensureBaseResumeAction(): Promise<Result<{ id: string; reused: boolean }>> {
  const user = await requireUser();
  const profile = await getFullProfile(user.id);
  if (!profile) return { ok: false, error: "Finish your profile first" };
  const latest = await prisma.resumeDocument.findFirst({ where: { userId: user.id, kind: "BASE" }, orderBy: { createdAt: "desc" } });
  if (latest && builtFromCurrentProfile(contentOf(latest), profile)) return { ok: true, data: { id: latest.id, reused: true } };
  const doc = await createBaseResume(user.id);
  revalidate();
  return { ok: true, data: { id: doc.id, reused: false } };
}

export async function renameResumeAction(id: string, title: string): Promise<Result<{ title: string }>> {
  const user = await requireUser();
  const t = z.string().trim().min(1).max(120).safeParse(title);
  if (!t.success) return { ok: false, error: "Give the résumé a name (up to 120 characters)" };
  const r = await prisma.resumeDocument.updateMany({ where: { id, userId: user.id }, data: { title: t.data } });
  if (!r.count) return { ok: false, error: "Résumé not found" };
  revalidate(id);
  return { ok: true, data: { title: t.data } };
}

export async function duplicateResumeAction(id: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const doc = await ownedDoc(user.id, id);
  if (!doc) return { ok: false, error: "Résumé not found" };
  const copy = await prisma.resumeDocument.create({
    data: { userId: user.id, kind: doc.kind, jobId: doc.jobId, title: `${doc.title} (copy)`, contentJson: doc.contentJson as Prisma.InputJsonValue, diffJson: doc.diffJson as Prisma.InputJsonValue, gapsJson: doc.gapsJson as Prisma.InputJsonValue, validationJson: doc.validationJson as Prisma.InputJsonValue },
  });
  revalidate();
  return { ok: true, data: { id: copy.id } };
}

/** Delete one résumé. Applications that referenced it keep their status; only the attachment is cleared. */
export async function deleteResumeAction(id: string): Promise<Result> {
  const user = await requireUser();
  const r = await prisma.resumeDocument.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) return { ok: false, error: "Résumé not found" };
  revalidate();
  return { ok: true, data: undefined };
}

/**
 * Keep one document per job: every older sibling (same kind and job) is removed and any application that
 * pointed at an older version is re-attached to the one kept. Used after a re-tailor and from the list's row menu.
 */
export async function deleteOlderVersionsAction(keepId: string): Promise<Result<{ deleted: number }>> {
  const user = await requireUser();
  const keep = await ownedDoc(user.id, keepId);
  if (!keep) return { ok: false, error: "Résumé not found" };
  const siblings = await prisma.resumeDocument.findMany({ where: { userId: user.id, kind: keep.kind, jobId: keep.jobId, id: { not: keep.id }, createdAt: { lte: keep.createdAt } }, select: { id: true } });
  if (!siblings.length) return { ok: true, data: { deleted: 0 } };
  const ids = siblings.map((s) => s.id);
  await prisma.$transaction([
    prisma.application.updateMany({ where: { userId: user.id, resumeDocumentId: { in: ids } }, data: { resumeDocumentId: keep.id } }),
    prisma.resumeDocument.deleteMany({ where: { id: { in: ids }, userId: user.id } }),
  ]);
  revalidate(keep.id);
  return { ok: true, data: { deleted: ids.length } };
}

const Patch = z.object({
  headline: z.string().max(200).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  bullets: z.array(z.object({ bulletId: z.string(), text: z.string().max(600) })).max(200).optional(),
  addSkills: z.array(z.string().min(1).max(80)).max(50).optional(),
  removeSkills: z.array(z.string()).max(150).optional(),
});
export type ResumePatch = z.infer<typeof Patch>;

/**
 * Inline edits from the workbench. Every edited bullet keeps its source text so it can still be reverted, and is
 * classified against the profile exactly like an AI rewrite would be: anything that introduces a skill or number
 * the profile does not contain is labeled unverified. An empty bullet removes it from the document only.
 */
export async function updateResumeContentAction(id: string, input: unknown): Promise<Result<{ content: ResumeContent; decisions: Record<string, boolean> }>> {
  const user = await requireUser();
  const patch = Patch.safeParse(input);
  if (!patch.success) return { ok: false, error: "Bad edit" };
  const [doc, profile] = await Promise.all([ownedDoc(user.id, id), getFullProfile(user.id)]);
  if (!doc || !profile) return { ok: false, error: "Résumé not found" };
  const job = doc.jobId ? await prisma.job.findUnique({ where: { id: doc.jobId }, select: { requiredSkills: true, preferredSkills: true } }) : null;
  const jobKeywords = new Set([...(job?.requiredSkills ?? []), ...(job?.preferredSkills ?? [])].map((s) => s.toLowerCase()));
  const allowed = allowedFromProfile(profile);
  const content = structuredClone(contentOf(doc));
  const decisions = { ...decisionsOf(doc) };
  const p = patch.data;

  if (p.headline !== undefined) content.headline = p.headline?.trim() || null;
  if (p.summary !== undefined) content.summary = p.summary?.trim() || null;

  const edits = new Map((p.bullets ?? []).map((b) => [b.bulletId, b.text.trim()]));
  const applyEdit = (b: Bullet): Bullet | null => {
    if (!edits.has(b.bulletId)) return b;
    const text = edits.get(b.bulletId)!;
    if (!text) return null;
    if (b.changeKind !== "added" && text === b.sourceText.trim()) return { ...b, text: b.sourceText, changeKind: "unchanged", reason: null, keywords: [], grounded: true };
    const cls = classifyText(text, b.sourceText, allowed);
    decisions[b.bulletId] = true;
    return { ...b, text, changeKind: b.changeKind === "added" ? "added" : "reworded", reason: cls.grounded ? "Edited by you." : `Edited by you. ${cls.issues.join("; ")}.`, keywords: extractSkills(text).filter((k) => jobKeywords.has(k.toLowerCase())), grounded: cls.grounded };
  };
  const keep = (b: Bullet | null): b is Bullet => b !== null;
  content.experience = content.experience.map((e) => ({ ...e, bullets: e.bullets.map(applyEdit).filter(keep) }));
  content.projects = content.projects.map((pr) => ({ ...pr, bullets: pr.bullets.map(applyEdit).filter(keep) }));

  if (p.removeSkills?.length) {
    const drop = new Set(p.removeSkills.map((s) => s.toLowerCase()));
    content.skills = content.skills.filter((s) => !drop.has(s.name.toLowerCase()));
  }
  for (const raw of p.addSkills ?? []) {
    const name = canonicalizeSkill(raw);
    const low = name.toLowerCase();
    if (!name || content.skills.some((s) => s.name.toLowerCase() === low)) continue;
    const grounded = allowed.skills.has(low) || allowed.text.includes(low);
    content.skills.push({ name, grounded, changeKind: "added", reason: grounded ? "Added by you; your profile already mentions it." : "Added by you from the keyword gaps. Keep it only if you have really used it." });
    decisions[`skill:${name}`] = true;
  }

  const diff = (doc.diffJson as Record<string, unknown> | null) ?? {};
  await prisma.resumeDocument.update({ where: { id: doc.id }, data: { contentJson: content as unknown as Prisma.InputJsonValue, diffJson: { ...diff, stats: diffStats(content), decisions } as Prisma.InputJsonValue } });
  revalidate(doc.id);
  return { ok: true, data: { content, decisions } };
}
