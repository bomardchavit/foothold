import { Prisma, type CandidateProfile } from "@prisma/client";
import {
  canonicalizeSkill, skillCategory, computeYearsExperience, formatDateRange, parseLocation,
  type ParsedResume, type ProfileEdit, type Preferences, type ScoreProfileInput, type AutofillProfile, WORK_AUTH_LABELS,
} from "@foothold/shared";
import { prisma } from "../db";
import { track } from "../analytics/server";
import { EVENTS } from "../analytics/events";

export const fullProfileInclude = {
  experiences: { orderBy: { order: "asc" as const }, include: { bullets: { orderBy: { order: "asc" as const } } } },
  educations: { orderBy: { order: "asc" as const } },
  projects: { orderBy: { order: "asc" as const }, include: { bullets: { orderBy: { order: "asc" as const } } } },
  skills: { orderBy: { name: "asc" as const } },
} satisfies Prisma.CandidateProfileInclude;
export type FullProfile = Prisma.CandidateProfileGetPayload<{ include: typeof fullProfileInclude }>;

export async function getFullProfile(userId: string): Promise<FullProfile | null> {
  return prisma.candidateProfile.findUnique({ where: { userId }, include: fullProfileInclude });
}

export async function ensureProfile(userId: string): Promise<FullProfile> {
  const existing = await getFullProfile(userId);
  if (existing) return existing;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.candidateProfile.create({ data: { userId, fullName: user.name, email: user.email } });
  return (await getFullProfile(userId))!;
}

function ymToDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1));
}
export function dateToYM(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function skillRows(profileId: string, names: string[], source: "PARSED" | "MANUAL") {
  const seen = new Set<string>();
  const rows: Prisma.SkillCreateManyInput[] = [];
  for (const n of names) {
    const canonical = canonicalizeSkill(n);
    const key = canonical.toLowerCase();
    if (!canonical || seen.has(key)) continue;
    seen.add(key);
    rows.push({ profileId, name: canonical, canonical: key, category: skillCategory(canonical), source });
  }
  return rows;
}

/** Replace résumé-derived sections of the profile with a freshly parsed résumé. Preferences are untouched. */
export async function applyParsedResume(userId: string, parsed: ParsedResume): Promise<FullProfile> {
  const profile = await ensureProfile(userId);
  await prisma.$transaction(async (tx) => {
    await tx.experience.deleteMany({ where: { profileId: profile.id } });
    await tx.education.deleteMany({ where: { profileId: profile.id } });
    await tx.project.deleteMany({ where: { profileId: profile.id } });
    await tx.skill.deleteMany({ where: { profileId: profile.id } });
    for (const [i, e] of parsed.experience.entries()) {
      await tx.experience.create({
        data: {
          profileId: profile.id, company: e.company, title: e.title, location: e.location ?? null, order: i,
          startDate: ymToDate(e.startDate), endDate: e.isCurrent ? null : ymToDate(e.endDate), isCurrent: e.isCurrent,
          bullets: { create: e.bullets.map((text, j) => ({ text, order: j })) },
        },
      });
    }
    for (const [i, ed] of parsed.education.entries()) {
      await tx.education.create({ data: { profileId: profile.id, school: ed.school, degree: ed.degree ?? null, field: ed.field ?? null, startDate: ymToDate(ed.startDate), endDate: ymToDate(ed.endDate), gpa: ed.gpa ?? null, order: i } });
    }
    for (const [i, p] of parsed.projects.entries()) {
      await tx.project.create({ data: { profileId: profile.id, name: p.name, url: p.url ?? null, description: p.description ?? null, order: i, bullets: { create: p.bullets.map((text, j) => ({ text, order: j })) } } });
    }
    const rows = skillRows(profile.id, parsed.skills, "PARSED");
    if (rows.length) await tx.skill.createMany({ data: rows, skipDuplicates: true });
    await tx.candidateProfile.update({
      where: { id: profile.id },
      data: {
        fullName: parsed.contact.fullName ?? profile.fullName,
        email: parsed.contact.email ?? profile.email,
        phone: parsed.contact.phone ?? profile.phone,
        location: parsed.contact.location ?? profile.location,
        linkedinUrl: parsed.contact.linkedinUrl ?? profile.linkedinUrl,
        githubUrl: parsed.contact.githubUrl ?? profile.githubUrl,
        websiteUrl: parsed.contact.websiteUrl ?? profile.websiteUrl,
        headline: parsed.headline ?? profile.headline,
        summary: parsed.summary ?? profile.summary,
        version: { increment: 1 },
      },
    });
  });
  await recomputeDerived(profile.id);
  return (await getFullProfile(userId))!;
}

export async function updateProfile(userId: string, edit: ProfileEdit): Promise<FullProfile> {
  const profile = await ensureProfile(userId);
  await prisma.$transaction(async (tx) => {
    await tx.experience.deleteMany({ where: { profileId: profile.id, id: { notIn: edit.experiences.map((e) => e.id).filter((x): x is string => !!x) } } });
    for (const [i, e] of edit.experiences.entries()) {
      const data = { company: e.company, title: e.title, location: e.location ?? null, startDate: ymToDate(e.startDate), endDate: e.isCurrent ? null : ymToDate(e.endDate), isCurrent: e.isCurrent, order: i };
      let id = e.id;
      if (id) { const r = await tx.experience.updateMany({ where: { id, profileId: profile.id }, data }); if (!r.count) id = undefined; }
      if (!id) id = (await tx.experience.create({ data: { ...data, profileId: profile.id } })).id;
      await tx.bullet.deleteMany({ where: { experienceId: id, id: { notIn: e.bullets.map((b) => b.id).filter((x): x is string => !!x) } } });
      for (const [j, b] of e.bullets.entries()) {
        if (b.id) { const r = await tx.bullet.updateMany({ where: { id: b.id, experienceId: id }, data: { text: b.text, order: j } }); if (r.count) continue; }
        await tx.bullet.create({ data: { experienceId: id, text: b.text, order: j } });
      }
    }
    await tx.education.deleteMany({ where: { profileId: profile.id, id: { notIn: edit.educations.map((e) => e.id).filter((x): x is string => !!x) } } });
    for (const [i, ed] of edit.educations.entries()) {
      const data = { school: ed.school, degree: ed.degree ?? null, field: ed.field ?? null, startDate: ymToDate(ed.startDate), endDate: ymToDate(ed.endDate), gpa: ed.gpa ?? null, order: i };
      if (ed.id) { const r = await tx.education.updateMany({ where: { id: ed.id, profileId: profile.id }, data }); if (r.count) continue; }
      await tx.education.create({ data: { ...data, profileId: profile.id } });
    }
    await tx.project.deleteMany({ where: { profileId: profile.id, id: { notIn: edit.projects.map((p) => p.id).filter((x): x is string => !!x) } } });
    for (const [i, p] of edit.projects.entries()) {
      const data = { name: p.name, url: p.url ?? null, description: p.description ?? null, order: i };
      let id = p.id;
      if (id) { const r = await tx.project.updateMany({ where: { id, profileId: profile.id }, data }); if (!r.count) id = undefined; }
      if (!id) id = (await tx.project.create({ data: { ...data, profileId: profile.id } })).id;
      await tx.bullet.deleteMany({ where: { projectId: id, id: { notIn: p.bullets.map((b) => b.id).filter((x): x is string => !!x) } } });
      for (const [j, b] of p.bullets.entries()) {
        if (b.id) { const r = await tx.bullet.updateMany({ where: { id: b.id, projectId: id }, data: { text: b.text, order: j } }); if (r.count) continue; }
        await tx.bullet.create({ data: { projectId: id, text: b.text, order: j } });
      }
    }
    await tx.skill.deleteMany({ where: { profileId: profile.id } });
    const rows = skillRows(profile.id, edit.skills, "MANUAL");
    if (rows.length) await tx.skill.createMany({ data: rows, skipDuplicates: true });
    await tx.candidateProfile.update({
      where: { id: profile.id },
      data: {
        fullName: edit.fullName ?? null, email: edit.email ?? null, phone: edit.phone ?? null, location: edit.location ?? null,
        linkedinUrl: edit.linkedinUrl ?? null, githubUrl: edit.githubUrl ?? null, websiteUrl: edit.websiteUrl ?? null,
        headline: edit.headline ?? null, summary: edit.summary ?? null, version: { increment: 1 },
      },
    });
  });
  await recomputeDerived(profile.id);
  return (await getFullProfile(userId))!;
}

export async function updatePreferences(userId: string, prefs: Preferences): Promise<FullProfile> {
  const profile = await ensureProfile(userId);
  await prisma.candidateProfile.update({
    where: { id: profile.id },
    data: { ...prefs, salaryFloor: prefs.salaryFloor ?? null, version: { increment: 1 } },
  });
  return (await getFullProfile(userId))!;
}

export async function recomputeDerived(profileId: string) {
  const exps = await prisma.experience.findMany({ where: { profileId } });
  const years = computeYearsExperience(exps.map((e) => ({ startDate: e.startDate, endDate: e.endDate, isCurrent: e.isCurrent, title: e.title })));
  await prisma.candidateProfile.update({ where: { id: profileId }, data: { yearsExperience: years } });
}

export async function completeOnboarding(userId: string): Promise<FullProfile> {
  const profile = await ensureProfile(userId);
  await recomputeDerived(profile.id);
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { onboardingCompletedAt: profile.onboardingCompletedAt ?? new Date(), version: { increment: 1 } } });
  track(userId, EVENTS.profile_completed, { skills: profile.skills.length, experiences: profile.experiences.length, targetRoles: profile.targetRoles });
  return (await getFullProfile(userId))!;
}

/** Callers trigger re-embedding + rematching through the queue module (kept out of this file to avoid an import cycle). */
export function needsRematch(p: FullProfile): boolean {
  return Boolean(p.onboardingCompletedAt);
}

/** Text that represents the candidate for embedding similarity. */
export function profileEmbeddingText(p: FullProfile): string {
  const parts = [
    p.headline ?? "", p.summary ?? "",
    p.targetRoles.length ? `Target roles: ${p.targetRoles.join(", ")}` : "",
    p.skills.length ? `Skills: ${p.skills.map((s) => s.name).join(", ")}` : "",
    ...p.experiences.map((e) => `${e.title} at ${e.company}. ${e.bullets.map((b) => b.text).join(" ")}`),
    ...p.projects.map((pr) => `Project ${pr.name}: ${pr.description ?? ""} ${pr.bullets.map((b) => b.text).join(" ")}`),
    ...p.educations.map((e) => `${e.degree ?? ""} ${e.field ?? ""} ${e.school}`),
  ];
  return parts.filter(Boolean).join("\n").slice(0, 20000);
}

export function toScoreProfile(p: CandidateProfile & { skills: { name: string }[] }): ScoreProfileInput {
  return { skills: p.skills.map((s) => s.name), seniority: p.seniority, yearsExperience: p.yearsExperience, industries: p.industries, locations: p.locations, remotePref: p.remotePref };
}

export function profileCompleteness(p: FullProfile): { score: number; missing: string[] } {
  const missing: string[] = [];
  if (!p.fullName) missing.push("name");
  if (!p.email) missing.push("email");
  if (!p.experiences.length) missing.push("work experience");
  if (!p.skills.length) missing.push("skills");
  if (!p.educations.length) missing.push("education");
  if (!p.targetRoles.length) missing.push("target roles");
  if (!p.summary && !p.headline) missing.push("headline or summary");
  return { score: Math.round(((7 - missing.length) / 7) * 100), missing };
}

export function toAutofillProfile(p: FullProfile, resume: { fileName: string; url: string; documentId: string } | null): AutofillProfile {
  const name = (p.fullName ?? "").trim();
  const [firstName, ...rest] = name.split(/\s+/);
  const current = p.experiences.find((e) => e.isCurrent) ?? p.experiences[0];
  const edu = p.educations[0];
  const loc = parseLocation(p.location);
  const authorized = p.workAuth === "UNKNOWN" ? null : p.workAuth !== "NONE";
  return {
    fullName: name, firstName: firstName ?? "", lastName: rest.join(" "), email: p.email ?? "", phone: p.phone ?? "", location: p.location ?? "", city: loc.city ?? "",
    linkedinUrl: p.linkedinUrl ?? "", githubUrl: p.githubUrl ?? "", websiteUrl: p.websiteUrl ?? "",
    currentCompany: current?.company ?? "", currentTitle: current?.title ?? "",
    school: edu?.school ?? "", degree: edu?.degree ?? "", fieldOfStudy: edu?.field ?? "", graduationYear: edu?.endDate ? String(edu.endDate.getUTCFullYear()) : "",
    workAuthorization: WORK_AUTH_LABELS[p.workAuth], authorizedToWorkUS: authorized, needsSponsorship: p.workAuth === "UNKNOWN" ? null : p.needsSponsorship,
    yearsExperience: p.yearsExperience, salaryExpectation: p.salaryFloor ? `${p.salaryFloor}` : "", resume, summary: p.summary ?? "",
  };
}

export function experienceDateRange(e: { startDate: Date | null; endDate: Date | null; isCurrent: boolean }) {
  return formatDateRange(e.startDate, e.endDate, e.isCurrent);
}
