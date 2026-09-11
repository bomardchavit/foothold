import { SKILLS, type SkillDef, type SkillCategory } from "./taxonomy";
import { normalizeCompanyName, normalizeText } from "../text";

export { SKILLS };
export type { SkillDef, SkillCategory };

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tool/framework names that are also ordinary English words ("excel at", "the notion of", "spring 2027").
 * These only count when written the way the product spells itself (capitalised), so prose never produces a skill.
 */
const AMBIGUOUS_NAMES = new Set([
  "excel", "notion", "segment", "linear", "spark", "flask", "express", "spring", "swift", "dart", "julia", "jest", "mocha",
  "sketch", "bootstrap", "framer", "helm", "argo", "lambda", "aurora", "rails", "compose", "amplitude", "remix", "phoenix", "groovy",
  "cypress", "sentry", "athena", "hive", "unity", "electron", "storybook", "gatsby", "sanity", "liquid", "retool", "buck", "apex",
  "chroma", "ruby", "rust", "scala", "perl", "lua", "bash", "vite", "rollup", "babel", "prettier", "canva", "webflow", "miro",
]);
/** Extra guards for names that are capitalised in ordinary prose too (sentence starts, seasons). */
const NEGATIVE_LOOKAHEAD: Record<string, string> = {
  excel: "(?!\\s+(?:at|in\\s+(?:a|an|the|this|our|fast)|as|through|beyond|when|under|within)\\b)",
  express: "(?!\\s+(?:interest|your|yourself|an?\\b|the|ideas|concerns|opinions|themselves|complex))",
  spring: "(?!\\s+(?:20\\d\\d|of|semester|quarter|start|\\d))",
  swift: "(?!\\s+(?:action|response|decision|resolution|execution|delivery|and))",
  segment: "(?!\\s+(?:of|the|our|and|leads?|customers?|users?|market))",
  linear: "(?!\\s+(?:algebra|regression|models?|path|thinking|scal))",
  unity: "(?!\\s+(?:of|and|among|between|in)\\b)",
  compose: "(?!\\s+(?:emails?|messages?|a|an|the|clear|and))",
};

/** Whitespace in an alias matches one or more spaces/hyphens; a hyphen matches an optional space/hyphen ("react-native" ~ "react native" ~ "reactnative"). */
function aliasBody(alias: string): string {
  return alias.split(/(\s+|-)/).map((part) => (/^\s+$/.test(part) ? "[\\s-]+" : part === "-" ? "[\\s-]?" : escapeRx(part))).join("");
}

function aliasToRegex(alias: string): RegExp {
  const key = alias.toLowerCase();
  if (AMBIGUOUS_NAMES.has(key)) {
    const cased = alias[0].toUpperCase() + alias.slice(1);
    return new RegExp(`(?<![\\w+#])${escapeRx(cased)}(?![\\w+#])${NEGATIVE_LOOKAHEAD[key] ?? ""}`);
  }
  return new RegExp(`(?<![\\w+#])${aliasBody(alias)}(?![\\w+#])`, "i");
}

interface Compiled { def: SkillDef; rx: RegExp; alias: string }
let compiled: Compiled[] | null = null;
function getCompiled(): Compiled[] {
  if (compiled) return compiled;
  const out: Compiled[] = [];
  for (const def of SKILLS) {
    if (def.rx) out.push({ def, rx: def.rx, alias: def.canonical });
    const names = [def.canonical, ...(def.aliases ?? [])];
    for (const a of names) {
      if (def.rx && a === def.canonical) continue;
      out.push({ def, rx: aliasToRegex(a), alias: a });
    }
  }
  // longest aliases first so "react native" wins over "react" when computing evidence
  out.sort((x, y) => y.alias.length - x.alias.length);
  compiled = out;
  return out;
}

const BY_CANONICAL = new Map<string, SkillDef>(SKILLS.map((d) => [d.canonical.toLowerCase(), d]));
const BY_ALIAS = new Map<string, SkillDef>();
for (const d of SKILLS) {
  BY_ALIAS.set(d.canonical.toLowerCase(), d);
  for (const a of d.aliases ?? []) BY_ALIAS.set(a.toLowerCase(), d);
}

let compiledByCanonical: Map<string, RegExp[]> | null = null;
function patternsFor(canonical: string): RegExp[] {
  if (!compiledByCanonical) {
    compiledByCanonical = new Map();
    for (const c of getCompiled()) {
      const key = c.def.canonical.toLowerCase();
      const list = compiledByCanonical.get(key) ?? [];
      list.push(c.rx);
      compiledByCanonical.set(key, list);
    }
  }
  const known = compiledByCanonical.get(canonical.toLowerCase());
  if (known) return known;
  // unknown (free-text) skill: whole-phrase match at word boundaries
  return [new RegExp(`(?<![\\w+#])${aliasBody(canonical.trim())}(?![\\w+#])`, "i")];
}

/** Map a free-text skill ("ReactJS", "k8s") to its canonical name; unknown skills are returned trimmed. */
export function canonicalizeSkill(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = BY_ALIAS.get(key) ?? BY_CANONICAL.get(key);
  if (hit) return hit.canonical;
  // single-alias regex match (handles "JavaScript (ES6)" style entries)
  for (const c of getCompiled()) {
    if (c.rx.test(name) && name.trim().length <= c.alias.length + 12) return c.def.canonical;
  }
  return name.trim().replace(/\s+/g, " ");
}

export function skillCategory(canonical: string): SkillCategory {
  return BY_CANONICAL.get(canonical.toLowerCase())?.category ?? "OTHER";
}

export function isKnownSkill(name: string): boolean {
  return BY_ALIAS.has(name.trim().toLowerCase());
}

/** Concrete, checkable skills: languages, frameworks, tools, cloud services, data/ML. */
export const TECHNICAL_CATEGORIES: ReadonlySet<SkillCategory> = new Set<SkillCategory>(["LANGUAGE", "FRAMEWORK", "TOOL", "CLOUD", "DATA"]);
export function isTechnicalSkill(canonical: string): boolean {
  return TECHNICAL_CATEGORIES.has(skillCategory(canonical));
}

/** How much a skill counts in the overlap score: a missing language costs far more than a missing industry word. */
export const SKILL_CATEGORY_WEIGHT: Record<SkillCategory, number> = {
  LANGUAGE: 1, FRAMEWORK: 1, TOOL: 1, CLOUD: 1, DATA: 1, DESIGN: 0.7, PRODUCT: 0.7, OTHER: 0.7, DOMAIN: 0.4, SOFT: 0.3,
};
export function skillWeight(canonical: string): number {
  return SKILL_CATEGORY_WEIGHT[skillCategory(canonical)];
}

export interface SkillHit { canonical: string; alias: string; index: number }

/** Scan free text for taxonomy skills; returns canonical names in order of first appearance. */
export function extractSkills(text: string): string[] {
  return extractSkillHits(text).map((h) => h.canonical);
}

export function extractSkillHits(text: string): SkillHit[] {
  const seen = new Map<string, SkillHit>();
  for (const c of getCompiled()) {
    const m = c.rx.exec(text);
    if (!m) continue;
    const prev = seen.get(c.def.canonical);
    if (!prev || m.index < prev.index) seen.set(c.def.canonical, { canonical: c.def.canonical, alias: m[0], index: m.index });
  }
  return [...seen.values()].sort((a, b) => a.index - b.index);
}

/**
 * Word-boundary-aware "does this text name this skill?" using the taxonomy's own patterns, so "C" never matches the
 * letter c inside a word and "Go" never matches "algorithm". Unknown skills match as a whole phrase.
 */
export function skillMentioned(canonical: string, text: string): boolean {
  if (!canonical.trim() || !text) return false;
  return patternsFor(canonical).some((rx) => rx.test(text));
}

/** Closure of the `implies` relation (matching only). */
export function expandImplied(skills: string[]): Set<string> {
  const out = new Set<string>();
  const stack = [...skills];
  while (stack.length) {
    const s = stack.pop()!;
    if (out.has(s)) continue;
    out.add(s);
    const def = BY_CANONICAL.get(s.toLowerCase());
    for (const i of def?.implies ?? []) if (!out.has(i)) stack.push(i);
  }
  return out;
}

export function skillAliases(canonical: string): string[] {
  const d = BY_CANONICAL.get(canonical.toLowerCase());
  return d ? [d.canonical, ...(d.aliases ?? [])] : [canonical];
}

/** True when a "skill" is really the hiring company's own name (Stripe posting → "Stripe", "Datadog engineers" → "Datadog"). */
export function isEmployerSkill(skill: string, company: string | null | undefined): boolean {
  if (!company) return false;
  const s = normalizeText(skill).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return false;
  const full = normalizeText(company).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const short = normalizeCompanyName(company);
  const first = short.split(" ")[0] ?? "";
  return s === full || s === short || (first.length >= 4 && s === first);
}

export function stripEmployerSkills(skills: string[], company: string | null | undefined): string[] {
  if (!company) return skills;
  return skills.filter((s) => !isEmployerSkill(s, company));
}
