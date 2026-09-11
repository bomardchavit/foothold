import { splitLines, SENIORITY_LABELS, WORK_AUTH_LABELS, type MatchBreakdown } from "@foothold/shared";
import type { FullProfile } from "../profile/service";
import { experienceDateRange } from "../profile/service";
import type { JobWithCompany } from "../matching/service";

export interface CtxLine { id: string; kind: "P" | "J" | "M"; label: string; text: string; ref?: { type: string; id?: string } }

export function buildProfileLines(p: FullProfile): CtxLine[] {
  const out: CtxLine[] = [];
  let n = 0;
  const push = (label: string, text: string, ref?: CtxLine["ref"]) => { n++; out.push({ id: `P${n}`, kind: "P", label, text: text.replace(/\s+/g, " ").trim(), ref }); };
  push("Name", `${p.fullName ?? "Candidate"}${p.headline ? ` — ${p.headline}` : ""}${p.location ? ` (${p.location})` : ""}`, { type: "field" });
  if (p.summary) push("Summary", p.summary, { type: "field" });
  for (const e of p.experiences) {
    push("Experience", `${e.title} at ${e.company}${e.location ? `, ${e.location}` : ""} (${experienceDateRange(e) || "dates not given"})`, { type: "experience", id: e.id });
    for (const b of e.bullets) push(`${e.company} bullet`, b.text, { type: "bullet", id: b.id });
  }
  for (const ed of p.educations) push("Education", `${[ed.degree, ed.field].filter(Boolean).join(" in ") || "Degree"} — ${ed.school}${ed.endDate ? ` (${ed.endDate.getUTCFullYear()})` : ""}${ed.gpa ? `, GPA ${ed.gpa}` : ""}`, { type: "education", id: ed.id });
  for (const pr of p.projects) {
    push("Project", `${pr.name}${pr.description ? ` — ${pr.description}` : ""}${pr.url ? ` (${pr.url})` : ""}`, { type: "project", id: pr.id });
    for (const b of pr.bullets) push(`${pr.name} bullet`, b.text, { type: "bullet", id: b.id });
  }
  const skills = p.skills.map((s) => s.name);
  for (let i = 0; i < skills.length; i += 12) push("Skills", skills.slice(i, i + 12).join(", "), { type: "skills" });
  push("Preferences", `Target roles: ${p.targetRoles.join(", ") || "not set"}. Locations: ${p.locations.join(", ") || "any"}; remote preference: ${p.remotePref.toLowerCase()}. Target level: ${SENIORITY_LABELS[p.seniority]}. Years of experience (computed): ${p.yearsExperience.toFixed(1)}.`, { type: "preferences" });
  push("Work authorization", `${WORK_AUTH_LABELS[p.workAuth]}${p.needsSponsorship ? "; needs H-1B sponsorship" : "; does not need sponsorship"}.${p.salaryFloor ? ` Salary floor $${p.salaryFloor.toLocaleString()}.` : ""}${p.industries.length ? ` Industries: ${p.industries.join(", ")}.` : ""}`, { type: "preferences" });
  return out;
}

export function buildJobLines(job: JobWithCompany): CtxLine[] {
  const out: CtxLine[] = [];
  let n = 0;
  const push = (label: string, text: string) => { n++; out.push({ id: `J${n}`, kind: "J", label, text: text.replace(/\s+/g, " ").trim() }); };
  push("Role", `${job.title} at ${job.company.name}${job.location ? `, ${job.location}` : ""}${job.isRemote ? " (remote)" : ""}. Level: ${SENIORITY_LABELS[job.seniority]}.${job.yearsMin != null ? ` Years: ${job.yearsMin}${job.yearsMax != null ? `–${job.yearsMax}` : "+"}.` : ""}${job.salaryMin ? ` Salary ${job.salaryMin.toLocaleString()}–${(job.salaryMax ?? job.salaryMin).toLocaleString()} ${job.salaryCurrency ?? "USD"}/${job.salaryPeriod ?? "year"}.` : ""}`);
  if (job.requiredSkills.length) push("Required skills", job.requiredSkills.join(", "));
  if (job.preferredSkills.length) push("Preferred skills", job.preferredSkills.join(", "));
  if (job.company.h1bSignal !== "UNKNOWN") push("Sponsorship", `USCIS data shows ${job.company.h1bMatchedName ?? job.company.name} with ${job.company.h1bApprovals} H-1B approvals in FY ${job.company.h1bYears.join(", ")} (${job.company.h1bSignal === "YES" ? "exact" : "fuzzy"} name match).`);
  for (const line of splitLines(job.description, 140)) push("Posting", line);
  return out;
}

export function buildMatchLines(b: MatchBreakdown): CtxLine[] {
  const out: CtxLine[] = [];
  let n = 0;
  const push = (label: string, text: string) => { n++; out.push({ id: `M${n}`, kind: "M", label, text }); };
  push("Overall fit", `${b.total}/100.`);
  for (const c of b.components) push(c.label, `${c.status === "na" ? "not applied" : c.status === "unknown" ? `unknown (scored ${c.score})` : `${c.score}/100`} (weight ${Math.round(c.weight * 100)}%). ${c.evidence.join(" ")}`);
  if (b.matchedSkills.length) push("Matched skills", b.matchedSkills.join(", "));
  if (b.missingRequired.length) push("Missing required skills", b.missingRequired.join(", "));
  if (b.missingPreferred.length) push("Missing preferred skills", b.missingPreferred.join(", "));
  return out;
}

export function renderLines(lines: CtxLine[]): string {
  return lines.map((l) => `[${l.id}] (${l.label}) ${l.text}`).join("\n");
}
export function linesMap(lines: CtxLine[]): Map<string, CtxLine> { return new Map(lines.map((l) => [l.id, l])); }
