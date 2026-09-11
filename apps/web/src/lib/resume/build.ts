import { type ResumeContent, formatDateRange } from "@foothold/shared";
import type { FullProfile } from "../profile/service";

export function buildBaseContent(p: FullProfile): ResumeContent {
  return {
    header: { fullName: p.fullName ?? "Your Name", email: p.email, phone: p.phone, location: p.location, links: [p.linkedinUrl, p.githubUrl, p.websiteUrl].filter((x): x is string => Boolean(x)) },
    headline: p.headline,
    summary: p.summary,
    experience: p.experiences.map((e) => ({
      experienceId: e.id, company: e.company, title: e.title, location: e.location, dateRange: formatDateRange(e.startDate, e.endDate, e.isCurrent),
      bullets: e.bullets.map((b) => ({ bulletId: b.id, text: b.text, sourceText: b.text, changeKind: "unchanged" as const, reason: null, keywords: [], grounded: true })),
    })),
    education: p.educations.map((e) => ({ school: e.school, degree: e.degree, field: e.field, dateRange: formatDateRange(e.startDate, e.endDate, false), gpa: e.gpa })),
    projects: p.projects.map((pr) => ({
      projectId: pr.id, name: pr.name, url: pr.url, description: pr.description,
      bullets: pr.bullets.map((b) => ({ bulletId: b.id, text: b.text, sourceText: b.text, changeKind: "unchanged" as const, reason: null, keywords: [], grounded: true })),
    })),
    skills: p.skills.map((s) => ({ name: s.name, grounded: true, changeKind: "unchanged" as const, reason: null })),
  };
}

/** Apply per-bullet decisions and the grounded-only switch to produce what gets rendered/exported. */
export function resolveContent(content: ResumeContent, decisions: Record<string, boolean>, groundedOnly: boolean): ResumeContent {
  const keep = (b: ResumeContent["experience"][number]["bullets"][number]) => {
    if (b.changeKind === "unchanged") return { ...b };
    const accepted = decisions[b.bulletId] ?? true;
    if (groundedOnly && !b.grounded) return b.changeKind === "added" ? null : { ...b, text: b.sourceText };
    if (!accepted) return b.changeKind === "added" ? null : { ...b, text: b.sourceText };
    return { ...b };
  };
  return {
    ...content,
    experience: content.experience.map((e) => ({ ...e, bullets: e.bullets.map(keep).filter((b): b is NonNullable<typeof b> => b !== null) })),
    projects: content.projects.map((p) => ({ ...p, bullets: p.bullets.map(keep).filter((b): b is NonNullable<typeof b> => b !== null) })),
    skills: content.skills.filter((s) => s.changeKind === "unchanged" || ((decisions[`skill:${s.name}`] ?? true) && (!groundedOnly || s.grounded))),
  };
}

export function diffStats(content: ResumeContent) {
  const bullets = [...content.experience.flatMap((e) => e.bullets), ...content.projects.flatMap((p) => p.bullets)];
  return {
    unchanged: bullets.filter((b) => b.changeKind === "unchanged").length,
    reworded: bullets.filter((b) => b.changeKind === "reworded").length,
    expanded: bullets.filter((b) => b.changeKind === "expanded").length,
    added: bullets.filter((b) => b.changeKind === "added").length,
    addedSkills: content.skills.filter((s) => s.changeKind === "added").length,
    ungrounded: bullets.filter((b) => !b.grounded).length + content.skills.filter((s) => !s.grounded).length,
    keywords: [...new Set(bullets.flatMap((b) => b.keywords))],
  };
}
