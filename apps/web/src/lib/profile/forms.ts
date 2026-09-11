import type { ProfileEdit, Preferences } from "@foothold/shared";
import { dateToYM, type FullProfile } from "./service";

export function profileToEdit(p: FullProfile): ProfileEdit {
  return {
    fullName: p.fullName, email: p.email, phone: p.phone, location: p.location, linkedinUrl: p.linkedinUrl, githubUrl: p.githubUrl, websiteUrl: p.websiteUrl,
    headline: p.headline, summary: p.summary,
    experiences: p.experiences.map((e) => ({ id: e.id, company: e.company, title: e.title, location: e.location, startDate: dateToYM(e.startDate), endDate: dateToYM(e.endDate), isCurrent: e.isCurrent, bullets: e.bullets.map((b) => ({ id: b.id, text: b.text })) })),
    educations: p.educations.map((e) => ({ id: e.id, school: e.school, degree: e.degree, field: e.field, startDate: dateToYM(e.startDate), endDate: dateToYM(e.endDate), gpa: e.gpa })),
    projects: p.projects.map((pr) => ({ id: pr.id, name: pr.name, url: pr.url, description: pr.description, bullets: pr.bullets.map((b) => ({ id: b.id, text: b.text })) })),
    skills: p.skills.map((s) => s.name),
  };
}

export function profileToPreferences(p: FullProfile): Preferences {
  return { targetRoles: p.targetRoles, locations: p.locations, remotePref: p.remotePref, seniority: p.seniority, workAuth: p.workAuth, needsSponsorship: p.needsSponsorship, salaryFloor: p.salaryFloor, industries: p.industries, companySizes: p.companySizes };
}
