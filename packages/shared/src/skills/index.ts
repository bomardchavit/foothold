import { SKILLS, type SkillDef, type SkillCategory } from "./taxonomy";

export { SKILLS };
export type { SkillDef, SkillCategory };

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasToRegex(alias: string): RegExp {
  const body = escapeRx(alias).replace(/\\\s|\s/g, "[\\s-]+").replace(/-/g, "[\\s-]?");
  return new RegExp(`(?<![\\w+#])${body}(?![\\w+#])`, "i");
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
