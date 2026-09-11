import { extractSkills, skillCategory, inferJobSeniority, inferIndustry, canonicalizeSkill, detectEmploymentType, detectWorkplaceType, type JobParsed } from "@foothold/shared";

const REQUIRED_HDR = /^(?:(?:minimum|basic|required|core|key|essential)\s+)?(?:requirements?|qualifications?|what\s+(?:you(?:'ll| will)?\s+)?(?:need|bring)|what\s+we(?:'re| are)\s+looking\s+for|who\s+you\s+are|about\s+you|must[- ]haves?|you\s+(?:have|are|should|will\s+have)|skills(?:\s+(?:and|&)\s+(?:experience|qualifications))?|your\s+(?:experience|background|profile)|required\s+skills|the\s+ideal\s+candidate|we(?:'d| would)\s+love\s+(?:to\s+see|it\s+if))\b/i;
const PREFERRED_HDR = /^(?:(?:preferred|desired|additional)\s+(?:qualifications?|skills|experience)|nice[- ]to[- ]haves?|bonus(?:\s+points)?|(?:a\s+)?plus(?:es)?|it(?:'s| is)\s+a\s+plus|extra\s+credit|preferred|ideally|great\s+if\s+you|even\s+better\s+if|good\s+to\s+have|would\s+be\s+(?:a\s+)?(?:plus|bonus)|not\s+required\s+but)/i;
const OTHER_HDR = /^(?:responsibilities|what\s+you(?:'ll| will)\s+do|the\s+role|about\s+the\s+(?:role|team|company|job|position)|in\s+this\s+role|your\s+(?:role|mission|impact)|day[- ]to[- ]day|benefits|perks|compensation|what\s+we\s+offer|why\s+(?:join|work)|about\s+us|our\s+(?:team|mission|values|stack)|equal\s+opportunity|how\s+to\s+apply|interview\s+process|location|salary|pay\s+range)/i;

function isHeader(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 70 && !/[.!?]$/.test(t) && !/^[•\-*]/.test(t);
}

export function sectionize(description: string): { required: string; preferred: string; other: string } {
  const buckets = { required: [] as string[], preferred: [] as string[], other: [] as string[] };
  let cur: keyof typeof buckets | null = null;
  for (const raw of description.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bare = line.replace(/[:\s]+$/, "");
    if (isHeader(line)) {
      if (PREFERRED_HDR.test(bare)) { cur = "preferred"; continue; }
      if (REQUIRED_HDR.test(bare)) { cur = "required"; continue; }
      if (OTHER_HDR.test(bare)) { cur = "other"; continue; }
    }
    // inline "Nice to have:" prefixes inside bullets
    if (/^(?:•|-|\*)?\s*(?:nice to have|bonus|preferred|plus)\s*[:-]/i.test(line)) { buckets.preferred.push(line); continue; }
    (cur ? buckets[cur] : buckets.other).push(line);
  }
  return { required: buckets.required.join("\n"), preferred: buckets.preferred.join("\n"), other: buckets.other.join("\n") };
}

const YEAR_RANGE = /(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:\+\s*)?(?:years?|yrs?)\b/i;
const YEAR_MIN = /(?:(?:minimum|at least|min\.?)\s+(?:of\s+)?)?(\d{1,2})\s*\+?\s*(?:or more\s+)?(?:years?|yrs?)\b(?:\s+(?:of\s+)?(?:relevant|professional|hands-on|industry|proven|demonstrated|work|software|engineering|product|full[- ]time)?\s*(?:experience|exp\b))?/i;

export function extractYears(text: string): { yearsMin: number | null; yearsMax: number | null } {
  const near = (m: RegExpExecArray | null) => m && /experience|exp\b|background|track record|working|hands-on|in\s+(?:a|an)\s+/i.test(text.slice(m.index, m.index + m[0].length + 60));
  const r = YEAR_RANGE.exec(text);
  if (r && near(r)) { const a = Number(r[1]), b = Number(r[2]); if (a <= 30 && b <= 40 && a <= b) return { yearsMin: a, yearsMax: b }; }
  const rx = new RegExp(YEAR_MIN.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const n = Number(m[1]);
    if (n > 0 && n <= 30 && near(m)) return { yearsMin: n, yearsMax: null };
  }
  return { yearsMin: null, yearsMax: null };
}

export function extractSalary(text: string): { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: "year" | "month" | "hour" | null } {
  const cur = /€/.test(text) ? "EUR" : /£/.test(text) ? "GBP" : "USD";
  let m = /[$€£]\s?(\d{2,3})(?:,(\d{3}))?\s*(?:-|–|to|—)\s*[$€£]?\s?(\d{2,3})(?:,(\d{3}))?(?!\s*k)/i.exec(text);
  if (m && m[2] && m[4]) {
    const lo = Number(m[1] + m[2]), hi = Number(m[3] + m[4]);
    if (lo >= 15000 && hi >= lo && hi < 2_000_000) return { salaryMin: lo, salaryMax: hi, salaryCurrency: cur, salaryPeriod: "year" };
  }
  m = /[$€£]\s?(\d{2,3})\s?k\s*(?:-|–|to|—)\s*[$€£]?\s?(\d{2,3})\s?k/i.exec(text);
  if (m) return { salaryMin: Number(m[1]) * 1000, salaryMax: Number(m[2]) * 1000, salaryCurrency: cur, salaryPeriod: "year" };
  m = /[$€£]\s?(\d{2,3}(?:\.\d{2})?)\s*(?:-|–|to|—)\s*[$€£]?\s?(\d{2,3}(?:\.\d{2})?)\s*(?:\/|per)\s*(?:hour|hr)/i.exec(text);
  if (m) return { salaryMin: Number(m[1]), salaryMax: Number(m[2]), salaryCurrency: cur, salaryPeriod: "hour" };
  m = /(\d{2,3}),(\d{3})\s*(?:-|–|to)\s*(\d{2,3}),(\d{3})\s*(?:USD|per year|annually|\/year|\/yr)/i.exec(text);
  if (m) return { salaryMin: Number(m[1] + m[2]), salaryMax: Number(m[3] + m[4]), salaryCurrency: "USD", salaryPeriod: "year" };
  return { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
}

export function detectRemote(title: string, location: string | null | undefined, description: string): boolean {
  const head = `${title}\n${location ?? ""}\n${description.slice(0, 1200)}`.toLowerCase();
  if (/\b(not remote|no remote|remote is not|on-?site only|in-?office|hybrid)\b/.test(head) && !/\bremote (or|and) hybrid|hybrid (or|and) remote|fully remote\b/.test(head)) return false;
  return /\b(remote|work from anywhere|distributed team|wfh)\b/.test(head);
}

const KEEP_CATEGORIES = new Set(["LANGUAGE", "FRAMEWORK", "TOOL", "CLOUD", "DATA", "DESIGN", "PRODUCT", "DOMAIN"]);
/** Role descriptors that appear in titles ("Full-Stack Engineer") are not requirements. */
const ROLE_DESCRIPTORS = new Set(["Full-Stack Development", "Frontend Development", "Backend Development", "Mobile Development", "Web Development", "Game Development", "Data Engineering", "Product Management", "Data Analysis", "Machine Learning", "Cybersecurity", "DevOps", "SRE", "Technical Leadership", "Customer Success", "Sales", "Recruiting", "Operations", "Growth"]);
export function skillsFrom(text: string): string[] {
  return extractSkills(text).filter((s) => KEEP_CATEGORIES.has(skillCategory(s)));
}

export function parseJobHeuristic(input: { title: string; description: string; location?: string | null }): JobParsed {
  const { required, preferred, other } = sectionize(input.description);
  const titleSkills = skillsFrom(input.title).filter((s) => !ROLE_DESCRIPTORS.has(s));
  let requiredSkills = required.trim() ? [...new Set([...titleSkills, ...skillsFrom(required)])] : [];
  if (requiredSkills.length <= titleSkills.length) requiredSkills = [...new Set([...titleSkills, ...skillsFrom(other || input.description)])];
  const preferredSkills = skillsFrom(preferred).filter((s) => !requiredSkills.includes(s));
  const years = extractYears(required.length > 40 ? required : input.description);
  const y2 = years.yearsMin == null ? extractYears(input.description) : years;
  const salary = extractSalary(input.description);
  const workplaceType = detectWorkplaceType(input.title, input.location, input.description);
  return {
    employmentType: detectEmploymentType(input.title, input.description),
    workplaceType,
    requiredSkills: requiredSkills.slice(0, 25).map(canonicalizeSkill),
    preferredSkills: preferredSkills.slice(0, 15).map(canonicalizeSkill),
    yearsMin: y2.yearsMin, yearsMax: y2.yearsMax,
    seniority: inferJobSeniority(input.title, y2.yearsMin, input.description),
    isRemote: workplaceType === "REMOTE" || detectRemote(input.title, input.location, input.description),
    ...salary,
    industry: inferIndustry(input.description),
  };
}
