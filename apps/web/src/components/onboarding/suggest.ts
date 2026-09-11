import { inferSeniorityFromTitle, seniorityFromYears, type SeniorityKey } from "@foothold/shared";

export interface PreferenceSuggestions { targetRoles: string[]; locations: string[]; seniority: SeniorityKey }

interface SuggestInput { experiences: Array<{ title: string; isCurrent: boolean; startDate: Date | null }>; location: string | null; yearsExperience: number; headline: string | null }

const LEVEL_WORDS = /\b(senior|sr\.?|junior|jr\.?|staff|principal|lead|associate|intern|entry[- ]level|new grad|graduate|apprentice|distinguished|chief|head of|vp|vice president|i{1,3}|iv|v|\d)\b/gi;
const NOISE = /\s*[(\[].*?[)\]]\s*|\s*[-–—|,/].*$/g; // "(Remote)", " - Payments team", ", Platform"

/** "Sr. Product Manager II (Growth)" → "Product Manager": the role noun that target-role matching keys on. */
export function roleFromTitle(title: string): string | null {
  const cleaned = title.replace(NOISE, " ").replace(LEVEL_WORDS, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 3) return null;
  return cleaned.split(" ").map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1))).join(" ");
}

/**
 * Prefill for the preferences step, derived from the parsed résumé so the form is never blank after an upload.
 * Roles come from the newest titles; the level from the latest title, falling back to years of experience.
 */
export function suggestPreferences(p: SuggestInput): PreferenceSuggestions {
  const ordered = [...p.experiences].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0));
  const roles: string[] = [];
  for (const e of ordered) {
    const r = roleFromTitle(e.title);
    if (r && !roles.some((x) => x.toLowerCase() === r.toLowerCase())) roles.push(r);
    if (roles.length >= 3) break;
  }
  const latest = ordered[0];
  let seniority: SeniorityKey = latest ? inferSeniorityFromTitle(latest.title) : "UNKNOWN";
  if (seniority === "UNKNOWN" && p.headline) seniority = inferSeniorityFromTitle(p.headline);
  if (seniority === "UNKNOWN" && p.yearsExperience > 0) seniority = seniorityFromYears(Math.round(p.yearsExperience));
  const loc = p.location?.trim();
  return { targetRoles: roles, locations: loc ? [loc] : [], seniority };
}
