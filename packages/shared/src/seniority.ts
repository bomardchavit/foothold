export type SeniorityKey = "INTERN" | "ENTRY" | "MID" | "SENIOR" | "STAFF" | "PRINCIPAL" | "MANAGER" | "DIRECTOR" | "EXECUTIVE" | "UNKNOWN";

export const SENIORITY_LABELS: Record<SeniorityKey, string> = {
  INTERN: "Intern", ENTRY: "Entry level", MID: "Mid level", SENIOR: "Senior", STAFF: "Staff / Lead", PRINCIPAL: "Principal",
  MANAGER: "Manager", DIRECTOR: "Director", EXECUTIVE: "Executive", UNKNOWN: "Not specified",
};

export const SENIORITY_RUNG: Record<SeniorityKey, number | null> = {
  INTERN: 0, ENTRY: 1, MID: 2, SENIOR: 3, STAFF: 4, PRINCIPAL: 5, MANAGER: 3.5, DIRECTOR: 5, EXECUTIVE: 6, UNKNOWN: null,
};

export function inferSeniorityFromTitle(title: string): SeniorityKey {
  const t = title.toLowerCase();
  if (/\b(intern|internship|co-op|coop)\b/.test(t)) return "INTERN";
  if (/\b(chief|cto|ceo|cfo|coo|cpo|vp|vice president|svp|evp|president)\b/.test(t)) return "EXECUTIVE";
  if (/\bdirector\b/.test(t)) return "DIRECTOR";
  if (/\b(head of|manager|mgr)\b/.test(t) && !/\bproduct manager\b|\bprogram manager\b|\bproject manager\b|\baccount manager\b/.test(t)) return "MANAGER";
  if (/\b(principal|distinguished|fellow|architect)\b/.test(t)) return "PRINCIPAL";
  if (/\b(staff|lead)\b/.test(t)) return "STAFF";
  if (/\b(senior|sr\.?|iii|3)\b/.test(t)) return "SENIOR";
  if (/\b(junior|jr\.?|associate|entry|new grad|graduate|early career|apprentice|\bi\b)\b/.test(t)) return "ENTRY";
  if (/\b(ii|2)\b/.test(t)) return "MID";
  return "UNKNOWN";
}

export function seniorityFromYears(yearsMin: number | null | undefined): SeniorityKey {
  if (yearsMin == null) return "UNKNOWN";
  if (yearsMin <= 1) return "ENTRY";
  if (yearsMin <= 4) return "MID";
  if (yearsMin <= 7) return "SENIOR";
  return "STAFF";
}

export function inferJobSeniority(title: string, yearsMin: number | null | undefined, description?: string): SeniorityKey {
  const fromTitle = inferSeniorityFromTitle(title);
  if (fromTitle !== "UNKNOWN") return fromTitle;
  if (description) {
    const d = description.toLowerCase();
    if (/\b(entry[- ]level|new grad|recent graduate|early career)\b/.test(d)) return "ENTRY";
    if (/\b(senior[- ]level|seasoned)\b/.test(d)) return "SENIOR";
  }
  return seniorityFromYears(yearsMin);
}
