import { extractSkills, numericTokens, skillCategory } from "@foothold/shared";
import type { CtxLine } from "./context";
import type { FullProfile } from "../profile/service";

export interface Flag { sentence: string; reason: string; severity: "warn" | "reject" }
export interface GroundingReport { status: "GROUNDED" | "PARTIAL" | "REJECTED" | "NA"; flagged: Array<{ sentence: string; reason: string }>; retried: boolean; mode: string }

const CITE = /\[(?:P|J|M)\d+(?:,\s*(?:P|J|M)\d+)*\]/g;
const ADVICE = /^(?:you (?:could|might|may want|should consider|can)|consider|try|i(?:'d| would) (?:suggest|recommend)|i recommend|tip|next step|to close|to strengthen|if you|when you|prepare|practice|expect|be ready|research|ask|bring|remember|note)/i;
const POSSESS = /\b(?:you(?:'ve|'re)?\s+(?:have\s+|are\s+|were\s+|also\s+|already\s+|clearly\s+)?(?:[a-z]+ed|have|are|know|bring|own|use|work|lead|build|ship|run|manage|design|write|hold|possess|bring)\b|your (?:experience|work|background|time|role|bullet|résumé|resume|profile|skills?|history|track record)|candidate (?:has|is|built|led|brings))/i;
const GENERAL = /\(general\)|\bgeneral(?:ly)? (?:speaking|knowledge)\b|typically|commonly|usually|most companies|many companies/i;

/** The set of things the candidate may be said to have. */
export function allowedFromProfile(p: FullProfile) {
  const text = [p.headline, p.summary, ...p.experiences.flatMap((e) => [e.title, e.company, ...e.bullets.map((b) => b.text)]), ...p.projects.flatMap((pr) => [pr.name, pr.description ?? "", ...pr.bullets.map((b) => b.text)]), ...p.educations.map((e) => `${e.school} ${e.degree ?? ""} ${e.field ?? ""}`)].filter(Boolean).join("\n");
  const skills = new Set([...p.skills.map((s) => s.name.toLowerCase()), ...extractSkills(text).map((s) => s.toLowerCase())]);
  const numbers = new Set(numericTokens(text));
  const orgs = new Set([...p.experiences.map((e) => e.company.toLowerCase()), ...p.educations.map((e) => e.school.toLowerCase()), ...p.projects.map((pr) => pr.name.toLowerCase())]);
  return { skills, numbers, orgs, text: text.toLowerCase() };
}
export type Allowed = ReturnType<typeof allowedFromProfile>;

function sentences(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(raw) || (line.length < 60 && /:$/.test(line))) continue; // headings
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z"“(])/)) if (s.trim().length > 12) out.push(s.trim());
  }
  return out;
}

export function checkGrounding(answer: string, lines: Map<string, CtxLine>, allowed: Allowed, opts: { requireCitations: boolean }): { flags: Flag[]; status: GroundingReport["status"] } {
  const flags: Flag[] = [];
  // 1. invalid citations
  for (const m of answer.matchAll(CITE)) {
    for (const id of m[0].slice(1, -1).split(/,\s*/)) if (!lines.has(id)) flags.push({ sentence: id, reason: `Cites ${id}, which does not exist`, severity: "reject" });
  }
  for (const s of sentences(answer)) {
    if (s.endsWith("?") || ADVICE.test(s) || GENERAL.test(s)) continue;
    const cites = [...s.matchAll(CITE)].flatMap((m) => m[0].slice(1, -1).split(/,\s*/));
    const citedText = cites.map((c) => lines.get(c)?.text.toLowerCase() ?? "").join(" ");
    const mentionsYou = POSSESS.test(s);
    const skillsHere = extractSkills(s).filter((sk) => skillCategory(sk) !== "SOFT");
    // 2. claims of possession must be in the profile
    if (mentionsYou) {
      for (const sk of skillsHere) {
        const low = sk.toLowerCase();
        const negated = new RegExp(`(?:not|no|lack|missing|without|don't|do not|haven't|absent|gap)[^.]{0,40}\\b${escapeRx(low)}\\b|\\b${escapeRx(low)}\\b[^.]{0,30}(?:is|are) (?:not|missing)`, "i").test(s);
        if (negated) continue;
        if (!allowed.skills.has(low) && !allowed.text.includes(low)) flags.push({ sentence: s, reason: `Claims experience with ${sk}, which is not in your profile`, severity: "reject" });
      }
      for (const n of numericTokens(s.replace(CITE, " "))) {
        if (/^\d{1,2}$/.test(n) && Number(n) <= 12) continue; // small counts ("2 roles") are fine
        if (!allowed.numbers.has(n) && !citedText.includes(n)) flags.push({ sentence: s, reason: `The number ${n} does not appear in your profile`, severity: "reject" });
      }
      if (opts.requireCitations && cites.length === 0) flags.push({ sentence: s, reason: "A claim about you without a profile citation", severity: "warn" });
    }
  }
  const rejects = flags.filter((f) => f.severity === "reject");
  const status = rejects.length ? "REJECTED" : flags.length ? "PARTIAL" : "GROUNDED";
  return { flags, status };
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
