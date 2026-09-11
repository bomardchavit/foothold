import { z } from "zod";
import { extractSkills, numericTokens, skillCategory, skillMentioned, isTechnicalSkill, isEmployerSkill, roleFit, type ResumeContent, type MatchBreakdown } from "@foothold/shared";
import type { FullProfile } from "../profile/service";
import type { JobWithCompany } from "../matching/service";
import { llmMode, structured, type LlmMode } from "../llm/client";
import { env } from "../env";
import { allowedFromProfile, type Allowed } from "../copilot/grounding";
import { buildBaseContent, diffStats } from "./build";

const ChangeKind = z.enum(["unchanged", "reworded", "expanded"]);
export const TailorOutputSchema = z.object({
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  bullets: z.array(z.object({ bulletId: z.string(), text: z.string(), changeKind: ChangeKind, reason: z.string().nullable(), keywords: z.array(z.string()) })),
  addedBullets: z.array(z.object({ experienceId: z.string(), text: z.string(), reason: z.string(), keywords: z.array(z.string()) })),
  skillsOrder: z.array(z.string()),
  addedSkills: z.array(z.object({ name: z.string(), reason: z.string() })),
  bulletOrder: z.record(z.string(), z.array(z.string())),
});
export type TailorOutput = z.infer<typeof TailorOutputSchema>;

export interface Validation { mode: LlmMode; groundedBullets: number; expandedBullets: number; addedBullets: number; addedSkills: number; issues: Array<{ bulletId: string; issue: string }> }

const SYSTEM = `You tailor a candidate's résumé to one job posting so it is the strongest honest fit. You get the candidate's profile (experiences with bullet ids), the posting, and the computed fit breakdown.
Goals, in order:
1. Reorder: within each role, put the bullets most relevant to this posting first (return bulletOrder per experienceId using bulletIds).
2. Reword: rewrite bullets to mirror the posting's vocabulary and lead with the most relevant outcome. Keep every fact (employer, title, dates, numbers) intact. Mark these changeKind "reworded" and list the posting keywords you surfaced in keywords.
3. Expand: where the candidate's work clearly implies more than the bullet says (scope, tools, outcomes typical for that work), you may write a stronger version that reaches toward the posting. Mark these changeKind "expanded" and explain in reason exactly what you inferred and why the candidate should verify it. Never change employers, titles, or dates. Do not invent specific numbers; if you add a metric, phrase it as an estimate and label it expanded.
4. Add: if a required skill from the posting is plausibly part of a role's work but no bullet covers it, you may propose one new bullet for that role in addedBullets (explain the inference in reason). Keep this rare.
5. Skills: return skillsOrder (the candidate's existing skills, most relevant first, only names that exist in the profile) and addedSkills only for posting keywords you believe the candidate has from their bullets (reason must point to the evidence).
6. Write a headline (≤ 12 words) and a summary (2–3 sentences) aimed at this posting, grounded in the profile.
Style: bullets ≤ 30 words, start with a strong verb, no first person, no buzzword lists. Return every bullet id you were given exactly once in bullets (use changeKind "unchanged" for ones you leave alone).`;

/** Code-level classifier: is this text fully supported by the profile? */
export function classifyText(text: string, sourceText: string, allowed: Allowed): { grounded: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const sk of extractSkills(text)) {
    if (skillCategory(sk) === "SOFT") continue;
    const low = sk.toLowerCase();
    if (!allowed.skills.has(low) && !skillMentioned(sk, allowed.text) && !skillMentioned(sk, sourceText)) issues.push(`mentions ${sk}, which is not in your profile`);
  }
  const srcNums = new Set(numericTokens(sourceText));
  for (const n of numericTokens(text)) if (!srcNums.has(n) && !allowed.numbers.has(n)) issues.push(`introduces the number ${n}`);
  return { grounded: issues.length === 0, issues };
}

function relevance(text: string, job: JobWithCompany): number {
  const skills = new Set([...job.requiredSkills, ...job.preferredSkills].map((s) => s.toLowerCase()));
  const hits = extractSkills(text).filter((s) => skills.has(s.toLowerCase())).length;
  const titleWords = job.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const words = text.toLowerCase();
  return hits * 3 + titleWords.filter((w) => words.includes(w)).length;
}

/** Heuristic tailoring: reorder bullets and skills by relevance, grounded headline/summary; no rewording. */
function tailorHeuristic(profile: FullProfile, job: JobWithCompany, breakdown: MatchBreakdown | null): ResumeContent {
  const base = buildBaseContent(profile);
  const skillsSet = new Set([...job.requiredSkills, ...job.preferredSkills].map((s) => s.toLowerCase()));
  for (const e of base.experience) e.bullets = [...e.bullets].sort((a, b) => relevance(b.text, job) - relevance(a.text, job));
  for (const p of base.projects) p.bullets = [...p.bullets].sort((a, b) => relevance(b.text, job) - relevance(a.text, job));
  base.skills = [...base.skills].sort((a, b) => Number(skillsSet.has(b.name.toLowerCase())) - Number(skillsSet.has(a.name.toLowerCase())));
  const technical = (breakdown?.matchedSkills ?? []).filter((s) => isTechnicalSkill(s) && !isEmployerSkill(s, job.company.name));
  const matched = (technical.length >= 2 ? technical : [...technical, ...base.skills.map((s) => s.name).filter((s) => isTechnicalSkill(s) && !technical.includes(s))]).slice(0, 5);
  const years = profile.yearsExperience;
  const role = profile.experiences[0];
  // Only point the headline at the posting when the title is actually in the candidate's lane.
  const fit = roleFit(profile.targetRoles, job.title);
  const headline = profile.headline ?? (fit != null && fit >= 0.5 ? job.title : role ? `${role.title}` : job.title);
  const summary = [
    `${headline} with ${years >= 1 ? `${years.toFixed(0)} years of experience` : "hands-on experience"}${matched.length ? ` in ${matched.join(", ")}` : ""}.`,
    role?.bullets[0] ? `Most recently at ${role.company}: ${role.bullets[0].text.replace(/\.$/, "")}.` : "",
  ].filter(Boolean).join(" ");
  return { ...base, headline, summary };
}

export async function tailorResume(profile: FullProfile, job: JobWithCompany, breakdown: MatchBreakdown | null, userId: string): Promise<{ content: ResumeContent; validation: Validation }> {
  const allowed = allowedFromProfile(profile);
  const mode = llmMode();
  if (mode === "heuristic") {
    const content = tailorHeuristic(profile, job, breakdown);
    return { content, validation: { mode, groundedBullets: countBullets(content), expandedBullets: 0, addedBullets: 0, addedSkills: 0, issues: [] } };
  }
  const base = buildBaseContent(profile);
  const profileText = [
    `Candidate: ${base.header.fullName}. Headline: ${base.headline ?? "none"}. Summary: ${base.summary ?? "none"}. Years: ${profile.yearsExperience}.`,
    ...base.experience.map((e) => `Experience ${e.experienceId}: ${e.title} at ${e.company} (${e.dateRange})\n${e.bullets.map((b) => `  bullet ${b.bulletId}: ${b.text}`).join("\n")}`),
    ...base.projects.map((p) => `Project ${p.projectId}: ${p.name} — ${p.description ?? ""}\n${p.bullets.map((b) => `  bullet ${b.bulletId}: ${b.text}`).join("\n")}`),
    `Skills: ${base.skills.map((s) => s.name).join(", ")}`,
  ].join("\n\n");
  const jobText = `Job: ${job.title} at ${job.company.name}\nRequired: ${job.requiredSkills.join(", ")}\nPreferred: ${job.preferredSkills.join(", ")}\nFit: ${breakdown ? `${breakdown.total}/100; missing required: ${breakdown.missingRequired.join(", ") || "none"}` : "n/a"}\n\n${job.description.slice(0, 12000)}`;
  let out: TailorOutput;
  try {
    out = await structured({ task: "tailorResume", schema: TailorOutputSchema, system: SYSTEM, cachedContext: `PROFILE:\n${profileText}`, user: `POSTING:\n${jobText}\n\nReturn the tailored plan.`, userId, model: env.modelMain, effort: "high", maxTokens: 16000 });
  } catch (e) {
    console.warn("[tailor] LLM failed, using heuristic:", e instanceof Error ? e.message : e);
    const content = tailorHeuristic(profile, job, breakdown);
    return { content, validation: { mode: "heuristic", groundedBullets: countBullets(content), expandedBullets: 0, addedBullets: 0, addedSkills: 0, issues: [{ bulletId: "-", issue: "AI tailoring failed; reordered only." }] } };
  }
  return assemble(base, out, allowed, job);
}

function countBullets(c: ResumeContent) { return c.experience.reduce((n, e) => n + e.bullets.filter((b) => b.grounded).length, 0) + c.projects.reduce((n, p) => n + p.bullets.filter((b) => b.grounded).length, 0); }

/** Structure-locked assembly: titles/employers/dates come from the profile; model output only touches bullet text, order, skills, headline, summary. */
export function assemble(base: ResumeContent, out: TailorOutput, allowed: Allowed, job: JobWithCompany): { content: ResumeContent; validation: Validation } {
  const byId = new Map(out.bullets.map((b) => [b.bulletId, b]));
  const issues: Validation["issues"] = [];
  let expanded = 0, added = 0, grounded = 0;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const jobKeywords = new Set([...job.requiredSkills, ...job.preferredSkills].map((s) => s.toLowerCase()));
  const applyBullet = (b: ResumeContent["experience"][number]["bullets"][number]) => {
    const m = byId.get(b.bulletId);
    if (!m || norm(m.text) === norm(b.sourceText)) { grounded++; return { ...b, changeKind: "unchanged" as const }; }
    const cls = classifyText(m.text, b.sourceText, allowed);
    let kind: "reworded" | "expanded" = m.changeKind === "expanded" ? "expanded" : "reworded";
    let reason = m.reason;
    if (!cls.grounded && kind === "reworded") { kind = "expanded"; reason = `${reason ? reason + " " : ""}Labeled expanded by the checker: ${cls.issues.join("; ")}.`; }
    if (!cls.grounded) issues.push({ bulletId: b.bulletId, issue: cls.issues.join("; ") });
    if (kind === "expanded") expanded++; else grounded++;
    const keywords = [...new Set([...m.keywords, ...extractSkills(m.text)])].filter((k) => jobKeywords.has(k.toLowerCase()));
    return { ...b, text: m.text.trim(), changeKind: kind, reason, keywords, grounded: cls.grounded };
  };
  const experience = base.experience.map((e) => {
    const order = out.bulletOrder[e.experienceId];
    let bullets: ResumeContent["experience"][number]["bullets"] = e.bullets.map(applyBullet);
    if (order?.length) { const idx = new Map(order.map((id, i) => [id, i])); bullets = [...bullets].sort((a, b) => (idx.get(a.bulletId) ?? 999) - (idx.get(b.bulletId) ?? 999)); }
    for (const [i, ab] of out.addedBullets.filter((x) => x.experienceId === e.experienceId).entries()) {
      const cls = classifyText(ab.text, "", allowed);
      added++;
      bullets.push({ bulletId: `added-${e.experienceId}-${i}`, text: ab.text.trim(), sourceText: "", changeKind: "added", reason: ab.reason, keywords: ab.keywords.filter((k) => jobKeywords.has(k.toLowerCase())), grounded: false });
      if (!cls.grounded) issues.push({ bulletId: `added-${e.experienceId}-${i}`, issue: cls.issues.join("; ") });
    }
    return { ...e, bullets };
  });
  const projects = base.projects.map((p) => ({ ...p, bullets: p.bullets.map(applyBullet) }));
  const existing = new Map(base.skills.map((s) => [s.name.toLowerCase(), s]));
  const orderedNames = out.skillsOrder.map((n) => n.toLowerCase()).filter((n) => existing.has(n));
  const skills = [...orderedNames.map((n) => existing.get(n)!), ...base.skills.filter((s) => !orderedNames.includes(s.name.toLowerCase()))];
  for (const s of out.addedSkills) {
    if (existing.has(s.name.toLowerCase())) continue;
    const inProfile = allowed.skills.has(s.name.toLowerCase()) || skillMentioned(s.name, allowed.text);
    skills.push({ name: s.name, grounded: inProfile, changeKind: "added", reason: s.reason });
  }
  const headline = out.headline?.trim() || base.headline;
  const summary = out.summary?.trim() || base.summary;
  const summaryCls = summary ? classifyText(summary, base.summary ?? "", allowed) : { grounded: true, issues: [] };
  if (!summaryCls.grounded) issues.push({ bulletId: "summary", issue: summaryCls.issues.join("; ") });
  const content: ResumeContent = { ...base, headline, summary, experience, projects, skills };
  return { content, validation: { mode: "anthropic", groundedBullets: grounded, expandedBullets: expanded, addedBullets: added, addedSkills: out.addedSkills.length, issues } };
}

export { diffStats };
