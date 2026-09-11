import { expandImplied, isTechnicalSkill, skillCategory, skillWeight } from "./skills";
import { industriesAdjacent } from "./industries";
import { parseLocation, sameCity, type ParsedLocation } from "./location";
import { SENIORITY_LABELS, SENIORITY_RUNG, isManagementLevel, type SeniorityKey, type EmploymentTypeKey } from "./seniority";

export type RemotePrefKey = "REMOTE" | "HYBRID" | "ONSITE" | "ANY";
export type ComponentKey = "skills" | "semantic" | "seniority" | "years" | "industry" | "location";
export type ComponentStatus = "scored" | "unknown" | "na";

export interface ScoreProfileInput {
  skills: string[];
  seniority: SeniorityKey;
  yearsExperience: number;
  industries: string[];
  locations: string[];
  remotePref: RemotePrefKey;
  targetRoles?: string[];
}
export interface ScoreJobInput {
  title?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  seniority: SeniorityKey;
  yearsMin: number | null;
  yearsMax: number | null;
  industry: string | null;
  /** "known" when the industry comes from a curated employer list or the source; "inferred" for keyword guesses from the posting text. */
  industryConfidence?: "known" | "inferred";
  employmentType?: EmploymentTypeKey;
  isRemote: boolean;
  location: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}
export interface ComponentResult {
  key: ComponentKey;
  label: string;
  weight: number;
  score: number;
  status: ComponentStatus;
  contribution: number;
  evidence: string[];
  details?: Record<string, unknown>;
}
export interface MatchBreakdown {
  total: number;
  components: ComponentResult[];
  matchedSkills: string[];
  missingRequired: string[];
  missingPreferred: string[];
  impliedMatches: Array<{ required: string; via: string }>;
  /** Multipliers applied to the weighted sum (role fit, internship mismatch), with the reason shown to the user. */
  adjustments?: Array<{ key: "roleFit" | "employmentType"; factor: number; reason: string }>;
}

export const WEIGHTS: Record<ComponentKey, number> = { skills: 0.35, semantic: 0.2, seniority: 0.15, years: 0.1, industry: 0.1, location: 0.1 };
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  skills: "Skills overlap", semantic: "Profile relevance", seniority: "Seniority fit", years: "Experience fit", industry: "Industry fit", location: "Location fit",
};

/** Cosine → 0..100 calibration per embedding provider. Values below `lo` score 0, above `hi` score 100. */
export const SEMANTIC_CALIBRATION: Record<string, { lo: number; hi: number }> = {
  voyage: { lo: 0.4, hi: 0.8 },
  openai: { lo: 0.25, hi: 0.7 },
  // the hashed local embedding clusters real postings at 0.03–0.20, so the window is narrow
  local: { lo: 0.05, hi: 0.35 },
};

/** How much of the raw score survives when the title does not match any target role at all (0.55 → a 70 becomes ~39). */
export const ROLE_FIT_FLOOR = 0.55;
/** Ceiling for an internship when the candidate is not looking for one (and vice versa). */
export const EMPLOYMENT_MISMATCH_CAP = 40;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r = (n: number) => Math.round(n);

function skillsComponent(profile: ScoreProfileInput, job: ScoreJobInput) {
  const have = new Set(profile.skills.map((s) => s.toLowerCase()));
  const implied = expandImplied(profile.skills);
  const impliedLower = new Set([...implied].map((s) => s.toLowerCase()));
  const impliedMatches: Array<{ required: string; via: string }> = [];
  const matched: string[] = [];
  const missingRequired: string[] = [];
  const missingPreferred: string[] = [];
  const req = [...new Set(job.requiredSkills)];
  const pref = [...new Set(job.preferredSkills)].filter((p) => !req.includes(p));
  // Skills are weighted by kind: a language or tool counts fully, a domain word ("Government", "SaaS") counts 0.4.
  let reqHit = 0, reqTotal = 0, prefHit = 0, prefTotal = 0;
  const reqLanguages = req.filter((s) => skillCategory(s) === "LANGUAGE");
  let langMatched = 0;
  for (const s of req) {
    const k = s.toLowerCase();
    const isLang = reqLanguages.length >= 2 && skillCategory(s) === "LANGUAGE";
    const w = isLang ? 0 : skillWeight(s);
    reqTotal += w;
    if (have.has(k)) { reqHit += w; matched.push(s); if (isLang) langMatched++; }
    else if (impliedLower.has(k)) { reqHit += w; matched.push(s); if (isLang) langMatched++; impliedMatches.push({ required: s, via: viaSkill(profile.skills, s) }); }
    else missingRequired.push(s);
  }
  // Postings list languages as alternatives ("Go, Java, or C++"): knowing one of them satisfies most of the ask.
  if (reqLanguages.length >= 2) {
    const groupWeight = Math.min(reqLanguages.length, 2);
    reqTotal += groupWeight;
    reqHit += (langMatched >= 1 ? Math.max(langMatched / reqLanguages.length, 0.7) : 0) * groupWeight;
  }
  for (const s of pref) {
    const k = s.toLowerCase();
    const w = skillWeight(s);
    prefTotal += w;
    if (have.has(k) || impliedLower.has(k)) { prefHit += w; matched.push(s); }
    else missingPreferred.push(s);
  }
  // report the costly gaps first
  missingRequired.sort((a, b) => skillWeight(b) - skillWeight(a));
  missingPreferred.sort((a, b) => skillWeight(b) - skillWeight(a));
  let score: number; let status: ComponentStatus = "scored";
  const evidence: string[] = [];
  const reqRatio = reqTotal > 0 ? reqHit / reqTotal : 0;
  const prefRatio = prefTotal > 0 ? prefHit / prefTotal : 0;
  const reqCount = req.filter((s) => have.has(s.toLowerCase()) || impliedLower.has(s.toLowerCase())).length;
  const prefCount = pref.filter((s) => have.has(s.toLowerCase()) || impliedLower.has(s.toLowerCase())).length;
  if (req.length === 0 && pref.length === 0) { score = 40; status = "unknown"; evidence.push("The posting lists no identifiable skills, so this component is a placeholder."); }
  else if (req.length === 0) { score = prefRatio * 100; evidence.push(`${prefCount} of ${pref.length} preferred skills.`); }
  else if (pref.length === 0) { score = reqRatio * 100; evidence.push(`${reqCount} of ${req.length} required skills.`); }
  else { score = (0.75 * reqRatio + 0.25 * prefRatio) * 100; evidence.push(`${reqCount} of ${req.length} required, ${prefCount} of ${pref.length} preferred.`); }
  if (status === "scored" && req.length + pref.length < 3) { score *= 0.75; evidence.push("The posting names only a couple of skills, so this component counts for less."); }
  if (status === "scored" && ![...req, ...pref].some(isTechnicalSkill)) { score = 0.5 * score + 0.5 * 40; evidence.push("The posting names no specific technologies, only domain areas, so this is weak evidence either way."); }
  if (matched.length) evidence.push(`You have: ${matched.slice(0, 8).join(", ")}${matched.length > 8 ? ` +${matched.length - 8} more` : ""}.`);
  if (reqLanguages.length >= 2 && langMatched >= 1 && langMatched < reqLanguages.length) evidence.push(`The posting lists ${reqLanguages.length} languages; you have ${langMatched}, which usually satisfies the ask.`);
  if (missingRequired.length) evidence.push(`Missing required: ${missingRequired.slice(0, 8).join(", ")}${missingRequired.length > 8 ? ` +${missingRequired.length - 8} more` : ""}.`);
  if (missingPreferred.length) evidence.push(`Missing preferred: ${missingPreferred.slice(0, 6).join(", ")}${missingPreferred.length > 6 ? ` +${missingPreferred.length - 6} more` : ""}.`);
  for (const im of impliedMatches.slice(0, 4)) evidence.push(`${im.required} counted via your ${im.via}.`);
  return { score: r(clamp(score)), status, evidence, matched, missingRequired, missingPreferred, impliedMatches };
}

function viaSkill(profileSkills: string[], target: string): string {
  for (const s of profileSkills) if (expandImplied([s]).has(target)) return s;
  return profileSkills[0] ?? "profile";
}

const ROLE_STOP = new Set(["senior", "sr", "junior", "jr", "staff", "principal", "lead", "associate", "intern", "ii", "iii", "iv", "i", "of", "and", "the", "a", "an", "to", "for", "in", "at", "with", "new", "grad", "level", "remote", "us", "usa", "hybrid"]);
const ROLE_SYNONYMS: Record<string, string> = { developer: "engineer", programmer: "engineer", engineering: "engineer", swe: "engineer", sde: "engineer", frontend: "front-end", backend: "back-end", fullstack: "full-stack", ml: "machine-learning", "machine": "machine-learning", learning: "machine-learning", pm: "product", mgr: "manager", management: "manager" };
/** Whole-phrase rewrites applied before tokenizing, for titles that name the role indirectly. */
const ROLE_PHRASES: Array<[RegExp, string]> = [
  [/\bmember of technical staff\b|\bmts\b/g, "software engineer"],
  [/\bsoftware development engineer\b/g, "software engineer"],
  [/\bsoftware developer\b/g, "software engineer"],
];
const roleTokens = (s: string) => {
  let t = s.toLowerCase();
  for (const [rx, rep] of ROLE_PHRASES) t = t.replace(rx, rep);
  return new Set(t.replace(/[^a-z0-9+#\-\s]/g, " ").split(/[\s,/]+/).filter((x) => x && !ROLE_STOP.has(x)).map((x) => ROLE_SYNONYMS[x] ?? x));
};

/** How well the job title matches any of the candidate's target roles (0..1). */
export function roleFit(targetRoles: string[] | undefined, title: string | undefined): number | null {
  if (!targetRoles?.length || !title) return null;
  const tt = roleTokens(title);
  let best = 0;
  for (const role of targetRoles) {
    const rt = roleTokens(role);
    if (!rt.size) continue;
    let hit = 0; for (const t of rt) if (tt.has(t)) hit++;
    const core = [...rt][rt.size - 1]; // last token is usually the role noun (engineer, manager, analyst)
    const fit = hit / rt.size * (tt.has(core) ? 1 : 0.6);
    best = Math.max(best, fit);
  }
  return best;
}

function semanticComponent(cos: number | null, provider: string | null, profile: ScoreProfileInput, job: ScoreJobInput) {
  const rf = roleFit(profile.targetRoles, job.title);
  const evidence: string[] = [];
  let semantic: number | null = null;
  if (cos != null) {
    const cal = SEMANTIC_CALIBRATION[provider ?? "local"] ?? SEMANTIC_CALIBRATION.local;
    semantic = clamp(((cos - cal.lo) / (cal.hi - cal.lo)) * 100);
    evidence.push(`Semantic similarity between your profile and the posting: ${cos.toFixed(2)} (${provider ?? "local"} embeddings).`);
  }
  if (rf != null) evidence.push(rf >= 0.99 ? `The title matches one of your target roles.` : rf > 0 ? `The title partly matches your target roles (${Math.round(rf * 100)}%).` : `The title does not match any of your target roles.`);
  if (semantic == null && rf == null) return { score: 0, status: "na" as ComponentStatus, evidence: ["No embedding available yet."] };
  const score = semantic != null && rf != null ? 0.5 * semantic + 0.5 * rf * 100 : semantic != null ? semantic : rf! * 100;
  return { score: r(score), status: "scored" as ComponentStatus, evidence };
}

function seniorityComponent(profile: ScoreProfileInput, job: ScoreJobInput) {
  const a = SENIORITY_RUNG[profile.seniority], b = SENIORITY_RUNG[job.seniority];
  if (a == null) return { score: 0, status: "na" as ComponentStatus, evidence: ["You have not set a target seniority."] };
  if (b == null) return { score: 50, status: "unknown" as ComponentStatus, evidence: ["The posting does not state a level."] };
  const jobMgmt = isManagementLevel(job.seniority), youMgmt = isManagementLevel(profile.seniority);
  if (jobMgmt !== youMgmt) {
    return {
      score: 25, status: "scored" as ComponentStatus,
      evidence: [jobMgmt ? `People-management role (${SENIORITY_LABELS[job.seniority]}); you are targeting an individual-contributor level (${SENIORITY_LABELS[profile.seniority]}).` : `Individual-contributor role (${SENIORITY_LABELS[job.seniority]}); you are targeting a people-management level (${SENIORITY_LABELS[profile.seniority]}).`],
    };
  }
  const d = Math.abs(a - b);
  const below = b < a; // a junior posting for a senior candidate is a worse fit than a stretch role
  const score = d <= 0.5 ? 100 : d <= 1.5 ? (below ? 40 : 70) : d <= 2.5 ? (below ? 15 : 35) : 0;
  const rel = b > a ? "above" : b < a ? "below" : "at";
  return { score, status: "scored" as ComponentStatus, evidence: [`Posting is ${SENIORITY_LABELS[job.seniority]}, ${rel} your target (${SENIORITY_LABELS[profile.seniority]}).`] };
}

function yearsComponent(profile: ScoreProfileInput, job: ScoreJobInput) {
  const y = profile.yearsExperience;
  if (job.yearsMin == null && job.yearsMax == null) return { score: 50, status: "unknown" as ComponentStatus, evidence: [`Posting does not state years of experience (you have ${y.toFixed(1)}).`] };
  const min = job.yearsMin ?? 0;
  const max = job.yearsMax ?? min + 4;
  let score: number;
  let ev: string;
  if (y < min) { score = clamp(100 - 25 * (min - y)); ev = `Asks for ${min}+ years; you have ${y.toFixed(1)} (${(min - y).toFixed(1)} short).`; }
  else if (y <= max) { score = 100; ev = `Asks for ${min}${job.yearsMax != null ? `–${max}` : "+"} years; you have ${y.toFixed(1)}.`; }
  else {
    const over = y - max;
    const explicitMax = job.yearsMax != null;
    score = over > 5 ? (explicitMax ? 60 : 70) : over > 2 && explicitMax ? 80 : 100;
    ev = `Asks for ${min}${explicitMax ? `–${max}` : "+"} years; you have ${y.toFixed(1)}${score < 100 ? " (more than the posting targets)" : ""}.`;
  }
  return { score: r(score), status: "scored" as ComponentStatus, evidence: [ev] };
}

function industryComponent(profile: ScoreProfileInput, job: ScoreJobInput) {
  if (!profile.industries.length) return { score: 0, status: "na" as ComponentStatus, evidence: ["You are open to any industry."] };
  if (!job.industry) return { score: 50, status: "unknown" as ComponentStatus, evidence: ["Company industry is unknown."] };
  const inferred = job.industryConfidence === "inferred";
  const note = inferred ? " (guessed from the posting text)" : "";
  if (profile.industries.some((i) => i.toLowerCase() === job.industry!.toLowerCase())) return { score: 100, status: "scored" as ComponentStatus, evidence: [`${job.industry} is one of your chosen industries${note}.`] };
  if (profile.industries.some((i) => industriesAdjacent(i, job.industry!))) return { score: 50, status: "scored" as ComponentStatus, evidence: [`${job.industry} is adjacent to your chosen industries${note}.`] };
  // a keyword guess that disagrees with your industries is weak evidence, so it costs less than a confirmed mismatch
  return { score: inferred ? 40 : 20, status: "scored" as ComponentStatus, evidence: [`${job.industry} is outside your chosen industries (${profile.industries.join(", ")})${note}.`] };
}

function locationComponent(profile: ScoreProfileInput, job: ScoreJobInput) {
  const wantsRemote = profile.remotePref === "REMOTE";
  const noPrefs = profile.locations.length === 0 && profile.remotePref === "ANY";
  if (noPrefs) return { score: 0, status: "na" as ComponentStatus, evidence: ["No location preference set."] };
  if (job.isRemote) {
    const score = profile.remotePref === "ONSITE" ? 70 : 100;
    return { score, status: "scored" as ComponentStatus, evidence: [profile.remotePref === "ONSITE" ? "Remote role; you prefer on-site." : "Remote role matches your preference."] };
  }
  const jobLoc: ParsedLocation = { raw: job.location ?? "", city: job.city, region: job.region, country: job.country, isRemote: false };
  if (!job.city && !job.region && !job.country) {
    return { score: wantsRemote ? 30 : 50, status: "unknown" as ComponentStatus, evidence: ["Posting location is unclear."] };
  }
  let best = 0; let why = `On-site/hybrid in ${job.location ?? job.city ?? job.region ?? job.country}; not near your locations.`;
  for (const loc of profile.locations) {
    const pl = parseLocation(loc);
    if (pl.isRemote && !pl.city && !pl.region) continue;
    if (sameCity(pl, jobLoc)) { best = 100; why = `${job.city ?? loc} matches your location ${loc}.`; break; }
    if (pl.region && jobLoc.region && pl.region === jobLoc.region && best < 60) { best = 60; why = `Same state (${pl.region}) as your location ${loc}.`; }
    else if (pl.country && jobLoc.country && pl.country === jobLoc.country && best < 25) { best = 25; why = `Same country as ${loc}, different city.`; }
  }
  if (profile.locations.length === 0 && wantsRemote) { best = 30; why = "On-site role; you prefer remote."; }
  else if (wantsRemote) { best = r(best * 0.6); why += " You prefer remote."; }
  return { score: best, status: "scored" as ComponentStatus, evidence: [why] };
}

export function scoreMatch(profile: ScoreProfileInput, job: ScoreJobInput, semanticCosine: number | null, embeddingProvider: string | null): MatchBreakdown {
  const sk = skillsComponent(profile, job);
  const parts: Array<[ComponentKey, { score: number; status: ComponentStatus; evidence: string[] }]> = [
    ["skills", sk],
    ["semantic", semanticComponent(semanticCosine, embeddingProvider, profile, job)],
    ["seniority", seniorityComponent(profile, job)],
    ["years", yearsComponent(profile, job)],
    ["industry", industryComponent(profile, job)],
    ["location", locationComponent(profile, job)],
  ];
  const applied = parts.filter(([, p]) => p.status !== "na");
  const weightSum = applied.reduce((s, [k]) => s + WEIGHTS[k], 0) || 1;
  const components: ComponentResult[] = parts.map(([key, p]) => {
    const weight = p.status === "na" ? 0 : WEIGHTS[key] / weightSum;
    return { key, label: COMPONENT_LABELS[key], weight: Number(weight.toFixed(3)), score: p.score, status: p.status, contribution: Number((p.score * weight).toFixed(1)), evidence: p.evidence };
  });
  let total = clamp(components.reduce((s, c) => s + c.score * c.weight, 0));
  const adjustments: NonNullable<MatchBreakdown["adjustments"]> = [];
  // The kind of job matters more than any single component: a perfect analyst posting is still not an engineering job.
  const rf = roleFit(profile.targetRoles, job.title);
  if (rf != null && rf < 0.99) {
    const factor = ROLE_FIT_FLOOR + (1 - ROLE_FIT_FLOOR) * rf;
    total *= factor;
    adjustments.push({ key: "roleFit", factor: Number(factor.toFixed(2)), reason: rf > 0 ? `The title only partly matches your target roles (${Math.round(rf * 100)}%), so the score is scaled to ${Math.round(factor * 100)}%.` : `The title does not match any of your target roles, so the score is scaled to ${Math.round(factor * 100)}%.` });
  }
  const wantsIntern = profile.seniority === "INTERN";
  const isIntern = job.employmentType === "INTERNSHIP";
  if (job.employmentType && job.employmentType !== "UNKNOWN" && wantsIntern !== isIntern && total > EMPLOYMENT_MISMATCH_CAP) {
    adjustments.push({ key: "employmentType", factor: Number((EMPLOYMENT_MISMATCH_CAP / total).toFixed(2)), reason: isIntern ? `This is an internship and you are targeting ${SENIORITY_LABELS[profile.seniority]} roles, so the score is capped at ${EMPLOYMENT_MISMATCH_CAP}.` : `You are targeting internships and this is not one, so the score is capped at ${EMPLOYMENT_MISMATCH_CAP}.` });
    total = EMPLOYMENT_MISMATCH_CAP;
  }
  return { total: r(clamp(total)), components, matchedSkills: sk.matched, missingRequired: sk.missingRequired, missingPreferred: sk.missingPreferred, impliedMatches: sk.impliedMatches, adjustments: adjustments.length ? adjustments : undefined };
}

// ---- years of experience from date ranges
export interface ExperienceSpan { startDate: Date | string | null; endDate: Date | string | null; isCurrent: boolean; title: string }

function toDate(d: Date | string | null): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(d);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1));
}
function mergeMonths(spans: Array<[number, number]>): number {
  const s = spans.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0; let cur: [number, number] | null = null;
  for (const sp of s) {
    if (!cur || sp[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [sp[0], sp[1]]; }
    else cur[1] = Math.max(cur[1], sp[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}
const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/** Years of experience: overlapping ranges merged; internships count half. */
export function computeYearsExperience(exps: ExperienceSpan[], now = new Date()): number {
  const nowM = monthIndex(now);
  const full: Array<[number, number]> = [];
  const intern: Array<[number, number]> = [];
  for (const e of exps) {
    const s = toDate(e.startDate); if (!s) continue;
    const en = e.isCurrent || !e.endDate ? null : toDate(e.endDate);
    const span: [number, number] = [monthIndex(s), en ? monthIndex(en) : nowM];
    (/\b(intern|internship|co-op)\b/i.test(e.title) ? intern : full).push(span);
  }
  const fullMonths = mergeMonths(full);
  const combined = mergeMonths([...full, ...intern]);
  const internExtra = combined - fullMonths; // intern months not already covered by full-time work
  return Math.round(((fullMonths + 0.5 * internExtra) / 12) * 10) / 10;
}

export function formatDateRange(start: string | Date | null, end: string | Date | null, isCurrent: boolean): string {
  const f = (d: string | Date | null) => {
    const dt = toDate(d); if (!dt) return "";
    return dt.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  };
  const a = f(start), b = isCurrent ? "Present" : f(end);
  if (!a && !b) return "";
  return `${a}${a && b ? " – " : ""}${b}`;
}
