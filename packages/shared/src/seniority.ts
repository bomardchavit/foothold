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

export type EmploymentTypeKey = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | "TEMPORARY" | "UNKNOWN";
export type WorkplaceTypeKey = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";

export function detectEmploymentType(title: string, description: string): EmploymentTypeKey {
  const t = title.toLowerCase();
  const head = description.slice(0, 2500).toLowerCase();
  if (/\b(intern|internship|co-op|coop)\b/.test(t) || /\b(internship|summer intern|intern program)\b/.test(head)) return "INTERNSHIP";
  if (/\b(contract|contractor|freelance|1099|c2c|corp[- ]to[- ]corp)\b/.test(t) || /\b(contract (?:role|position|basis)|contractor|freelance)\b/.test(head)) return "CONTRACT";
  if (/\b(part[- ]time)\b/.test(t) || /\bpart[- ]time\b/.test(head)) return "PART_TIME";
  if (/\b(temporary|temp|seasonal)\b/.test(t) || /\b(temporary position|seasonal role)\b/.test(head)) return "TEMPORARY";
  if (/\bfull[- ]time\b/.test(t + " " + head)) return "FULL_TIME";
  return description.length > 200 ? "FULL_TIME" : "UNKNOWN"; // postings are full-time unless they say otherwise
}

export function detectWorkplaceType(title: string, location: string | null | undefined, description: string, sourceRemote?: boolean | null): WorkplaceTypeKey {
  const loc = (location ?? "").toLowerCase();
  const t = title.toLowerCase();
  const head = description.slice(0, 2500).toLowerCase();
  const all = `${t} ${loc} ${head}`;
  if (/\bhybrid\b/.test(loc) || /\bhybrid\b/.test(t) || /\b(hybrid (?:role|schedule|work|position|model)|\d\s*days? (?:a|per) week (?:in|at) (?:the )?office|in[- ]office \d)/.test(head)) return "HYBRID";
  if (sourceRemote || /\b(remote|work from anywhere|wfh)\b/.test(loc) || /\bremote\b/.test(t) || /\b(fully remote|remote[- ]first|100% remote|remote (?:role|position|work) )/.test(head)) {
    if (/\b(not remote|no remote|remote is not|on-?site only|in[- ]office only)\b/.test(head)) return "ONSITE";
    return "REMOTE";
  }
  if (/\b(on-?site|in[- ]office|in[- ]person)\b/.test(all)) return "ONSITE";
  return location && location.trim() ? "ONSITE" : "UNKNOWN";
}
