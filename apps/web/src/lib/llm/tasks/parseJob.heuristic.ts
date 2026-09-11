import { extractSkillHits, skillCategory, isTechnicalSkill, inferJobSeniority, inferIndustry, canonicalizeSkill, detectEmploymentType, detectWorkplaceType, stripEmployerSkills, type JobParsed } from "@foothold/shared";

const REQUIRED_HDR = /^(?:(?:minimum|basic|required|core|key|essential|the|our)\s+)?(?:requirements?|qualifications?|what\s+(?:you(?:'ll| will)?\s+)?(?:need|bring)|what\s+we(?:'re| are)?\s+(?:looking|look)\s+for(?:\s+in\s+you)?|who\s+you\s+are|about\s+you|must[- ]haves?|you\s+(?:have|are|should\s+have|will\s+have|might\s+thrive)|skills(?:\s+(?:and|&)\s+(?:experience|qualifications))?|your\s+(?:experience|background|profile|qualifications)|required\s+skills|the\s+ideal\s+candidate|we(?:'d| would)\s+love\s+(?:to\s+see|it\s+if|to\s+hear\s+from\s+you\s+if)|we\s+want\s+to\s+hear\s+from\s+you\s+if|what\s+(?:it\s+takes|makes\s+you\s+a\s+(?:good|great|strong)\s+fit)|you\s+should\s+apply\s+if|experience\s+(?:we're|we\s+are)\s+looking\s+for|you(?:'re| are)\s+a\s+(?:good|great|strong)\s+fit\s+if|what\s+you\s+have)\b/i;
const PREFERRED_HDR = /^(?:(?:preferred|desired|additional)\s+(?:qualifications?|skills|experience)|nice[- ]to[- ]haves?|bonus(?:\s+points)?|(?:a\s+)?plus(?:es)?|it(?:'s| is)\s+a\s+plus|(?:an\s+)?added\s+plus|extra\s+credit|preferred|ideally|great\s+if\s+you|even\s+better\s+if|good\s+to\s+have|would\s+be\s+(?:a\s+)?(?:plus|bonus)|not\s+required\s+but|while\s+it'?s\s+not\s+required|you\s+might\s+also\s+have)/i;
const OTHER_HDR = /^(?:responsibilities|what\s+you(?:'ll| will)\s+(?:do|be\s+doing|work\s+on|own)|the\s+role|about\s+the\s+(?:role|team|company|job|position|opportunity)|in\s+this\s+role|your\s+(?:role|mission|impact)|day[- ]to[- ]day|the\s+team|the\s+opportunity|what\s+you'll\s+achieve|key\s+responsibilities|how\s+you(?:'ll| will)\s+(?:contribute|make\s+an\s+impact)|our\s+(?:team|stack|tech\s+stack)|location|team\s+matching)\b/i;
/** Sections that describe the employer, pay, or hiring policy rather than the job. Never a source of skills. */
const BOILERPLATE_HDR = /^(?:benefits|perks|compensation|pay\s+transparency|pay\s+range|salary|annual\s+base\s+salary|base\s+salary|total\s+rewards|what\s+we\s+offer|why\s+(?:join|work)|equal\s+(?:employment\s+)?opportunity|eeo|diversity|commitment\s+to\s+diversity|inclusion|our\s+(?:values|mission|culture|story|commitment|benefits)|who\s+we\s+are|about\s+(?!the\s+(?:role|team|job|position|opportunity)\b|you\b)|privacy|accommodations?|how\s+to\s+apply|application\s+process|interview\s+process|hiring\s+process|legal|disclaimer|notice|internship\s+(?:pay|compensation)|us\s+applicants|equity)\b/i;
/** Lines that are benefits/EEO text wherever they appear (Coinbase and Figma print these as bullets with no header). */
const BOILERPLATE_LINE = /\b(?:medical|dental|401\s?\(?k\)?|federal,?\s+state|applicable\s+laws?|reasonable\s+accommodations?|hiring\s+process|equal\s+(?:employment\s+)?opportunity|without\s+regard\s+to|protected\s+(?:by\s+law|veteran|characteristic|class)|criminal\s+histor|authoriz(?:ed|ation)\s+to\s+work|visa\s+sponsorship|background\s+check|e-verify|privacy\s+(?:notice|policy)|paid\s+time\s+off|parental\s+leave|stock\s+(?:options|purchase)|\brsus?\b|\bespp\b|life\s+insurance|disability\s+insurance|commuter|wellness\s+(?:stipend|benefit)|gym\s+membership|mental\s+health\s+benefits|health\s+insurance|(?:healthcare|health\s+care),\s+dental)\b|generative\s+ai\s+responsibly|human\s+oversight/i;

const BULLET_RX = /^\s*[•\-*–—▪●‣◦►]\s*/;

function isHeader(line: string): boolean {
  const t = line.trim().replace(/\s*\([^)]*\)\s*:?$/, "").replace(/[:\s]+$/, "");
  return t.length > 0 && t.length <= 70 && !/[.!?]$/.test(t) && !BULLET_RX.test(line);
}

/** Header text with the trailing colon and parenthetical ("(ie. job requirements):") removed and curly quotes straightened. */
function headerKey(line: string): string {
  return line.trim().replace(/[’‘]/g, "'").replace(/\s*\([^)]*\)\s*:?$/, "").replace(/[:\s]+$/, "");
}

export interface Sections { required: string; preferred: string; other: string; boilerplate: string }

export function sectionize(description: string): Sections {
  const buckets = { required: [] as string[], preferred: [] as string[], other: [] as string[], boilerplate: [] as string[] };
  let cur: keyof typeof buckets | null = null;
  for (const raw of description.replace(/[’‘]/g, "'").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeader(line)) {
      const bare = headerKey(line);
      if (PREFERRED_HDR.test(bare)) { cur = "preferred"; continue; }
      if (REQUIRED_HDR.test(bare)) { cur = "required"; continue; }
      if (OTHER_HDR.test(bare)) { cur = "other"; continue; }
      if (BOILERPLATE_HDR.test(bare)) { cur = "boilerplate"; continue; }
    }
    if (BOILERPLATE_LINE.test(line)) { buckets.boilerplate.push(line); continue; }
    // inline "Nice to have:" prefixes inside bullets
    if (/^(?:•|-|\*)?\s*(?:nice to have|bonus|preferred|plus)\s*[:-]/i.test(line)) { buckets.preferred.push(line); continue; }
    (cur ? buckets[cur] : buckets.other).push(line);
  }
  return { required: buckets.required.join("\n"), preferred: buckets.preferred.join("\n"), other: buckets.other.join("\n"), boilerplate: buckets.boilerplate.join("\n") };
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

export type Salary = { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; salaryPeriod: "year" | "month" | "hour" | null };
const NO_SALARY: Salary = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
const CURRENCY: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", USD: "USD", CAD: "CAD", EUR: "EUR", GBP: "GBP", AUD: "AUD" };
const PAY_HEADING = /\b(?:base\s+salary|salary\s+range|pay\s+range|compensation\s+range|annual\s+(?:base\s+)?(?:salary|compensation)|estimated\s+(?:annual\s+)?salary|base\s+pay|salary|compensation|pay\s+transparency)\b/gi;
const num = (s: string) => Number(s.replace(/,/g, "").replace(/\.\d{2}$/, ""));

interface SalaryCandidate extends Salary { index: number }

function salaryCandidates(text: string): SalaryCandidate[] {
  const out: SalaryCandidate[] = [];
  const push = (index: number, lo: number, hi: number | null, currency: string, period: Salary["salaryPeriod"]) => {
    if (period === "year" && (lo < 15000 || (hi != null && (hi < lo || hi >= 2_000_000)))) return;
    if (period === "month" && (lo < 1500 || (hi != null && (hi < lo || hi >= 100_000)))) return;
    out.push({ index, salaryMin: lo, salaryMax: hi, salaryCurrency: currency, salaryPeriod: period });
  };
  // $150,000 - $190,000 · $153,000 — $376,000 USD · $244,000.00 - $310,000.00 · USD 150,000 to 200,000
  for (const m of text.matchAll(/(?:([$€£])\s?|\b(USD|CAD|EUR|GBP|AUD)\s?\$?)(\d{1,3}(?:,\d{3})+|\d{5,6})(?:\.\d{2})?\s*(?:-|–|—|to)\s*(?:[$€£]\s?|(?:USD|CAD|EUR|GBP|AUD)\s?)?(\d{1,3}(?:,\d{3})+|\d{5,6})(?:\.\d{2})?(?!\s*k)\s*(USD|CAD|EUR|GBP|AUD)?\b/gi)) {
    const period = /\bmonthly\b|\bper\s+month\b|\/\s*month\b/i.test(text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 12)) ? "month" : "year";
    push(m.index, num(m[3]), num(m[4]), CURRENCY[(m[5] ?? m[2] ?? m[1]).toUpperCase()] ?? CURRENCY[m[1] ?? "$"] ?? "USD", period);
  }
  // $120k–$160k · $120K - 160K
  for (const m of text.matchAll(/([$€£])\s?(\d{2,3})\s?k\s*(?:-|–|—|to)\s*[$€£]?\s?(\d{2,3})\s?k\b/gi)) push(m.index, Number(m[2]) * 1000, Number(m[3]) * 1000, CURRENCY[m[1]] ?? "USD", "year");
  // $40 - $55 per hour
  for (const m of text.matchAll(/([$€£])\s?(\d{2,3}(?:\.\d{2})?)\s*(?:-|–|—|to)\s*[$€£]?\s?(\d{2,3}(?:\.\d{2})?)\s*(?:\/|per|an)\s*(?:hour|hr)\b/gi)) push(m.index, Number(m[2]), Number(m[3]), CURRENCY[m[1]] ?? "USD", "hour");
  // 150,000 - 200,000 USD · 150,000 – 200,000 per year
  for (const m of text.matchAll(/(?<![$€£\d])(\d{2,3},\d{3})\s*(?:-|–|—|to)\s*(\d{2,3},\d{3})\s*(USD|CAD|EUR|GBP|AUD|per year|annually|\/year|\/yr)\b/gi)) push(m.index, num(m[1]), num(m[2]), CURRENCY[m[3].toUpperCase()] ?? "USD", "year");
  // $150K+ · from $150,000
  for (const m of text.matchAll(/(?:from\s+|starting\s+at\s+)?([$€£])\s?(\d{2,3})\s?k\+|(?:from|starting\s+at)\s+([$€£])\s?(\d{1,3}(?:,\d{3})+)(?!\s*(?:-|–|—|to))/gi)) {
    const lo = m[2] ? Number(m[2]) * 1000 : num(m[4]);
    push(m.index, lo, null, CURRENCY[m[1] ?? m[3] ?? "$"] ?? "USD", "year");
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The salary range stated for this role: the one closest after a pay heading wins over stray ranges elsewhere in the text. */
export function extractSalary(text: string): Salary {
  const cands = salaryCandidates(text);
  if (!cands.length) return NO_SALARY;
  const headings = [...text.matchAll(PAY_HEADING)].map((m) => m.index);
  let best: SalaryCandidate | null = null; let bestDist = Infinity;
  for (const c of cands) {
    for (const h of headings) {
      const d = c.index - h;
      if (d >= 0 && d < 400 && d < bestDist) { best = c; bestDist = d; }
    }
  }
  const pick = best ?? cands.find((c) => c.salaryMax != null) ?? cands[0];
  return { salaryMin: pick.salaryMin, salaryMax: pick.salaryMax, salaryCurrency: pick.salaryCurrency, salaryPeriod: pick.salaryPeriod };
}

export function detectRemote(title: string, location: string | null | undefined, description: string): boolean {
  const head = `${title}\n${location ?? ""}\n${description.slice(0, 1200)}`.toLowerCase();
  if (/\b(not remote|no remote|remote is not|on-?site only|in-?office|hybrid)\b/.test(head) && !/\bremote (or|and) hybrid|hybrid (or|and) remote|fully remote\b/.test(head)) return false;
  return /\b(remote|work from anywhere|distributed team|wfh)\b/.test(head);
}

const KEEP_CATEGORIES = new Set(["LANGUAGE", "FRAMEWORK", "TOOL", "CLOUD", "DATA", "DESIGN", "PRODUCT", "DOMAIN"]);
/** Role descriptors that appear in titles ("Full-Stack Engineer") are not requirements. */
const ROLE_DESCRIPTORS = new Set(["Full-Stack Development", "Frontend Development", "Backend Development", "Mobile Development", "Web Development", "Game Development", "Data Engineering", "Product Management", "Data Analysis", "Machine Learning", "Cybersecurity", "DevOps", "SRE", "Technical Leadership", "Customer Success", "Sales", "Recruiting", "Operations", "Growth", "Program Management", "Project Management", "Business Development", "Product Marketing", "Digital Marketing", "Software Architecture", "Business Analysis", "Strategy Consulting"]);
/**
 * Domain words that show up in every posting's prose ("partner with sales", "career growth", "operations team") and
 * are only real requirements when the role itself is in that domain.
 */
const DOMAIN_NOISE: Array<[string, RegExp | null]> = [
  ["Government", /government|public sector|federal|civic|policy/i],
  ["Healthcare", /health|clinical|medical|care\b/i],
  ["Legal", /legal|counsel|compliance|privacy|regulatory|contract/i],
  ["Sales", /sales|account executive|account manager|business development|revenue|gtm|go-to-market|partnerships?|solutions? engineer|customer engineer/i],
  ["Recruiting", /recruit|talent|sourcer|people|\bhr\b|human resources/i],
  ["People Operations", /people|\bhr\b|human resources|talent|workplace|employee/i],
  ["Growth", /growth|marketing|acquisition|lifecycle/i],
  ["Roadmapping", /product|program|project|strategy|roadmap/i],
  ["Hardware", /hardware|firmware|electrical|embedded|silicon|fpga|data ?cent|network|physical/i],
  ["Insurance", /insurance|claims|underwrit|actuar|risk/i],
  ["Media", /media|content|entertainment|creator|marketing|communications?|editorial|brand/i],
  ["Operations", /operations?|\bops\b|bizops|program|logistics|supply chain|support|success|fulfil/i],
  ["Customer Success", /customer|support|success|account|service|onboarding/i],
  ["Budgeting", /financ|fp&a|budget|accounting|controller|treasury|operations?|planning/i],
  ["Product Management", /product/i],
  ["Data-Driven Decision Making", null],
  ["Technical Writing", /writ|documentation|content|technical writer|developer advocate|education/i],
  ["Blockchain", /crypto|blockchain|web3|defi|onchain|on-chain|wallet|protocol|stablecoin/i],
  ["Fintech", /fintech|payments?|financ|banking|treasury|lending|risk|fraud|money/i],
  ["SaaS", null],
  ["E-commerce", /commerce|marketplace|retail|merchant|checkout|shop/i],
  ["Retail", /retail|store|merchant|grocery|consumer/i],
  ["Nonprofit", /nonprofit|non-profit|impact|community|philanthrop/i],
];

function bulletLines(text: string): Array<{ start: number; end: number; bullet: boolean }> {
  const out: Array<{ start: number; end: number; bullet: boolean }> = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    out.push({ start: pos, end: pos + line.length, bullet: BULLET_RX.test(line) });
    pos += line.length + 1;
  }
  return out;
}

interface SkillsFromOptions {
  /** Keep DESIGN/PRODUCT/DOMAIN hits only when they occur on a bullet line (prose mentions are usually context, not asks). */
  domainOnlyInBullets?: boolean;
  /** Languages, frameworks, tools, cloud and data only. */
  technicalOnly?: boolean;
}

export function skillsFrom(text: string, opts: SkillsFromOptions = {}): string[] {
  if (!text.trim()) return [];
  const lines = bulletLines(text);
  const out: string[] = [];
  for (const hit of extractSkillHits(text)) {
    const cat = skillCategory(hit.canonical);
    if (!KEEP_CATEGORIES.has(cat)) continue;
    if (isTechnicalSkill(hit.canonical)) { out.push(hit.canonical); continue; }
    if (opts.technicalOnly) continue;
    if (opts.domainOnlyInBullets && !lines.find((l) => hit.index >= l.start && hit.index <= l.end)?.bullet) continue;
    out.push(hit.canonical);
  }
  return out;
}

function dropDomainNoise(skills: string[], title: string): string[] {
  return skills.filter((s) => {
    const rule = DOMAIN_NOISE.find(([name]) => name === s);
    if (!rule) return true;
    return rule[1] ? rule[1].test(title) : false;
  });
}

export interface ParseJobInput { title: string; description: string; location?: string | null; company?: string | null }

export function parseJobHeuristic(input: ParseJobInput): JobParsed {
  const { required, preferred, other } = sectionize(input.description);
  const titleSkills = skillsFrom(input.title).filter((s) => !ROLE_DESCRIPTORS.has(s));
  const clean = (skills: string[]) => stripEmployerSkills(dropDomainNoise([...new Set(skills)], input.title), input.company);
  let requiredSkills = required.trim() ? clean([...titleSkills, ...skillsFrom(required, { domainOnlyInBullets: true })]) : [];
  // No requirements section (or nothing in it): fall back to the body, but only concrete technologies plus bulleted domain asks.
  if (requiredSkills.length <= titleSkills.length) requiredSkills = clean([...titleSkills, ...skillsFrom(other, { domainOnlyInBullets: true })]);
  let preferredSkills = clean(skillsFrom(preferred, { domainOnlyInBullets: true })).filter((s) => !requiredSkills.includes(s));
  // Technologies named in the team/role description ("our backend monorepo in Go, Python and Rust") are useful signal without being hard requirements.
  // Lines that talk about the employer ("Anduril is committed to ... computer vision, sensor fusion") describe the company, not the role.
  const companyWord = input.company ? input.company.trim().split(/\s+/)[0]?.replace(/[^\w.&'-]/g, "") : "";
  const companyRx = companyWord && companyWord.length >= 3 ? new RegExp(`\\b${companyWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
  const bodyProse = companyRx ? other.split("\n").filter((l) => !companyRx.test(l)).join("\n") : other;
  const bodyTech = clean(skillsFrom(bodyProse, { technicalOnly: true })).filter((s) => !requiredSkills.includes(s) && !preferredSkills.includes(s));
  preferredSkills = [...preferredSkills, ...bodyTech.slice(0, 8)];
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
