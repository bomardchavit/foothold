import type { ResumeContent } from "@foothold/shared";
import type { FullProfile } from "@/lib/profile/service";

/**
 * Is a stored résumé built from the profile as it is right now? Compares the structure that tailoring
 * locks to the profile (roles, projects, bullet source text, education, listed skills). Headline and summary
 * are ignored because tailoring rewrites them, and user additions (changeKind "added") are ignored because
 * they live only in the document. Preference edits never make a résumé stale.
 */
export function builtFromCurrentProfile(content: ResumeContent, profile: FullProfile): boolean {
  const header = content.header;
  if (header.fullName !== (profile.fullName ?? "Your Name") || header.email !== profile.email || header.phone !== profile.phone || header.location !== profile.location) return false;
  const sameBullets = (docBullets: ResumeContent["experience"][number]["bullets"], profileBullets: Array<{ id: string; text: string }>) => {
    const own = docBullets.filter((b) => b.changeKind !== "added");
    if (own.length !== profileBullets.length) return false;
    const byId = new Map(profileBullets.map((b) => [b.id, b.text]));
    return own.every((b) => byId.get(b.bulletId) === b.sourceText);
  };
  if (content.experience.length !== profile.experiences.length) return false;
  for (const e of profile.experiences) {
    const d = content.experience.find((x) => x.experienceId === e.id);
    if (!d || d.title !== e.title || d.company !== e.company || !sameBullets(d.bullets, e.bullets)) return false;
  }
  if (content.projects.length !== profile.projects.length) return false;
  for (const p of profile.projects) {
    const d = content.projects.find((x) => x.projectId === p.id);
    if (!d || d.name !== p.name || !sameBullets(d.bullets, p.bullets)) return false;
  }
  if (content.education.length !== profile.educations.length) return false;
  for (const [i, ed] of profile.educations.entries()) {
    const d = content.education[i];
    if (!d || d.school !== ed.school || d.degree !== ed.degree || d.field !== ed.field) return false;
  }
  const docSkills = new Set(content.skills.filter((s) => s.changeKind !== "added").map((s) => s.name.toLowerCase()));
  const profileSkills = new Set(profile.skills.map((s) => s.name.toLowerCase()));
  if (docSkills.size !== profileSkills.size) return false;
  for (const s of profileSkills) if (!docSkills.has(s)) return false;
  return true;
}
