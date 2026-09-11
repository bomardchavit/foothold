import { extractSkills, numericTokens, skillCategory, skillMentioned } from "@foothold/shared";
import type { CtxLine } from "./context";
import type { FullProfile } from "../profile/service";

export interface Flag { sentence: string; reason: string; severity: "warn" | "reject" }
export interface GroundingReport { status: "GROUNDED" | "PARTIAL" | "REJECTED" | "NA"; flagged: Array<{ sentence: string; reason: string }>; retried: boolean; mode: string }

const CITE = /\[(?:P|J|M)\d+(?:,\s*(?:P|J|M)\d+)*\]/g;
const ADVICE = /^(?:you (?:could|might|may want|should consider|can)|consider|try|i(?:'d| would) (?:suggest|recommend)|i recommend|tip|next step|to close|to strengthen|if you|when you|prepare|practice|expect|be ready|research|ask|bring|remember|note)/i;
const POSSESS = /\b(?:you(?:'ve|'re)?\s+(?:have\s+|are\s+|were\s+|also\s+|already\s+|clearly\s+)?(?:[a-z]+ed|have|are|know|bring|own|use|work|lead|build|ship|run|manage|design|write|hold|possess|bring)\b|your (?:experience|work|background|time|role|bullet|résumé|resume|profile|skills?|history|track record)|candidate (?:has|is|built|led|brings))/i;
/** "The posting asks for X" is a claim about the job, not about the candidate. */
const JOB_CLAIM = /\b(?:posting|job|role|position|listing|description|they|employer|company|team)\b[^.]{0,24}\b(?:asks?|requires?|requiring|lists?|wants?|needs?|expects?|prefers?|mentions?|calls? for|is looking for|are looking for|looking for)\b/i;
/** "not in your profile", "you don't list", "missing from your résumé": a statement of absence, not of possession. */
const NEG_POSSESS = /\b(?:not|no|don't|do not|doesn't|does not|never|missing|lack|lacks|lacking|without|absent|gap|haven't|have not|isn't|is not|aren't|are not)\b[^.]{0,60}\b(?:profile|résumé|resume|background|experience|list|listed|history|bullets?)\b|\b(?:profile|résumé|resume)\b[^.]{0,30}\b(?:does not|doesn't|lacks|is missing|has no)\b/i;
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
    const negativePossession = NEG_POSSESS.test(s);
    const skillsHere = extractSkills(s).filter((sk) => skillCategory(sk) !== "SOFT");
    // 2. claims of possession must be in the profile
    if (mentionsYou) {
      for (const sk of skillsHere) {
        const low = sk.toLowerCase();
        // Split into clauses so "asks for Java, C, C++, which is not in your profile" negates every listed skill.
        const clause = clauseFor(s, sk);
        if (clause === null) continue; // skill only appears inside a citation or not at all
        if (JOB_CLAIM.test(clause) || NEG_POSSESS.test(clause) || negatedNear(clause, low)) continue;
        if (!allowed.skills.has(low) && !skillMentioned(sk, allowed.text)) flags.push({ sentence: s, reason: `Claims experience with ${sk}, which is not in your profile`, severity: "reject" });
      }
      for (const n of numericTokens(s.replace(CITE, " "))) {
        if (/^\d{1,2}$/.test(n) && Number(n) <= 12) continue; // small counts ("2 roles") are fine
        if (!allowed.numbers.has(n) && !citedText.includes(n)) flags.push({ sentence: s, reason: `The number ${n} does not appear in your profile`, severity: "reject" });
      }
      // A statement of absence ("not in your profile") needs no profile citation: there is nothing to cite.
      if (opts.requireCitations && cites.length === 0 && !negativePossession) flags.push({ sentence: s, reason: "A claim about you without a profile citation", severity: "warn" });
    }
  }
  const rejects = flags.filter((f) => f.severity === "reject");
  const status = rejects.length ? "REJECTED" : flags.length ? "PARTIAL" : "GROUNDED";
  return { flags, status };
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The clause (split on ";", " which ", " but ", " while ", " whereas ") that names the skill, with a lookback so a trailing "which is not…" clause still governs the list before it. */
function clauseFor(sentence: string, skill: string): string | null {
  const parts = sentence.split(/\s*;\s*|,?\s+(?=(?:which|but|while|whereas|although|though|however)\b)/i);
  for (let i = 0; i < parts.length; i++) {
    if (!skillMentioned(skill, parts[i])) continue;
    // include the following clause when it is a relative/contrast clause ("…, which is not in your profile")
    const next = parts[i + 1] && /^(?:which|but|while|whereas|although|though|however)\b/i.test(parts[i + 1]) ? ` ${parts[i + 1]}` : "";
    return parts[i] + next;
  }
  return null;
}
function negatedNear(clause: string, low: string): boolean {
  return new RegExp(`(?:not|no|lack|lacks|missing|without|don't|do not|haven't|absent|gap|never)[^.]{0,120}\\b${escapeRx(low)}\\b|\\b${escapeRx(low)}\\b[^.]{0,120}(?:is|are|was|were)\\s+(?:not|missing|absent)`, "i").test(clause);
}
