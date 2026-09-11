"use client";
import type { FieldIssue } from "@/app/actions/profile";

export type ErrorMap = Record<string, string>;

/** Zod's default wording is for developers; say what the person has to do instead. */
export function friendlyMessage(message: string): string {
  if (/too small|at least 1|>=1|expected string to have/i.test(message) && !/target role/i.test(message)) return "Required";
  if (/too big|<=\d+ characters/i.test(message)) return "Too long";
  if (/invalid input: expected string/i.test(message)) return "Required";
  return message;
}

export function toErrorMap(issues: FieldIssue[] | undefined): ErrorMap {
  const out: ErrorMap = {};
  for (const i of issues ?? []) if (!out[i.path]) out[i.path] = friendlyMessage(i.message);
  return out;
}

/** "experiences.0.startDate" → "Start date, role 1": the label a person would use for the field. */
export function describePath(path: string): string {
  const NAMES: Record<string, string> = {
    fullName: "Full name", email: "Email", phone: "Phone", location: "Location", linkedinUrl: "LinkedIn", githubUrl: "GitHub", websiteUrl: "Website", headline: "Headline", summary: "Summary",
    company: "Company", title: "Title", startDate: "Start date", endDate: "End date", school: "School", degree: "Degree", field: "Field", gpa: "GPA", name: "Name", url: "URL", description: "Description", text: "Bullet", skills: "Skills",
    targetRoles: "Target roles", locations: "Locations", remotePref: "Remote preference", seniority: "Seniority", workAuth: "Work authorization", salaryFloor: "Salary floor", industries: "Industries", companySizes: "Company size",
  };
  const parts = path.split(".");
  const leaf = parts[parts.length - 1];
  const label = NAMES[leaf] ?? leaf;
  const section = parts[0] === "experiences" ? "role" : parts[0] === "educations" ? "school" : parts[0] === "projects" ? "project" : null;
  const idx = section && /^\d+$/.test(parts[1] ?? "") ? Number(parts[1]) + 1 : null;
  const bullet = parts[2] === "bullets" && /^\d+$/.test(parts[3] ?? "") ? Number(parts[3]) + 1 : null;
  if (section && idx) return `${bullet ? `Bullet ${bullet}` : label}, ${section} ${idx}`;
  return label;
}

/** Bring the first invalid field into view; the toast alone disappears before a long form can be scanned. */
export function scrollToFirstError(errors: ErrorMap) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(first)}"]`);
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
  el?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1 text-xs text-destructive" role="alert" data-testid="field-error">{message}</p>;
}
