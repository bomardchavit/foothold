import { extractSkills, expandImplied, skillCategory, skillAliases } from "@foothold/shared";
import type { FullProfile } from "../profile/service";
import type { JobWithCompany } from "../matching/service";

export interface KeywordGap { term: string; status: "have" | "implied" | "missing"; suggestion: string; required: boolean; evidenceBulletId?: string }

/**
 * Terms in the posting that are absent from the résumé, each with a one-line suggestion grounded in
 * existing experience, or marked "you don't have this". Pure code; no LLM required.
 */
export async function computeKeywordGaps(profile: FullProfile, job: JobWithCompany): Promise<KeywordGap[]> {
  const bullets = [...profile.experiences.flatMap((e) => e.bullets.map((b) => ({ id: b.id, text: b.text, where: e.company }))), ...profile.projects.flatMap((p) => p.bullets.map((b) => ({ id: b.id, text: b.text, where: p.name })))];
  const profileText = [profile.headline, profile.summary, ...bullets.map((b) => b.text), ...profile.skills.map((s) => s.name)].filter(Boolean).join("\n").toLowerCase();
  const listed = new Set(profile.skills.map((s) => s.name.toLowerCase()));
  const implied = new Set([...expandImplied(profile.skills.map((s) => s.name))].map((s) => s.toLowerCase()));
  const terms = [...new Set([...job.requiredSkills.map((s) => [s, true] as const), ...job.preferredSkills.map((s) => [s, false] as const), ...extractSkills(job.description).filter((s) => skillCategory(s) !== "SOFT").map((s) => [s, false] as const)].map((t) => JSON.stringify(t)))].map((t) => JSON.parse(t) as [string, boolean]);
  const out: KeywordGap[] = [];
  const seen = new Set<string>();
  for (const [term, required] of terms) {
    const low = term.toLowerCase();
    if (seen.has(low)) continue; seen.add(low);
    const aliases = skillAliases(term).map((a) => a.toLowerCase());
    const inResume = listed.has(low) || aliases.some((a) => profileText.includes(a));
    if (inResume) continue; // not a gap
    const evidence = bullets.find((b) => { const t = b.text.toLowerCase(); return aliases.some((a) => t.includes(a)); });
    if (evidence) { out.push({ term, status: "have", required, suggestion: `Your ${evidence.where} bullet already describes this ("${evidence.text.slice(0, 80)}…"). Name it as "${term}" explicitly.`, evidenceBulletId: evidence.id }); continue; }
    if (implied.has(low)) {
      const via = profile.skills.find((s) => expandImplied([s.name]).has(term))?.name;
      out.push({ term, status: "implied", required, suggestion: `Not named in your résumé, but your ${via ?? "listed tools"} experience is the closest evidence. Add "${term}" only if you have really used it.` });
      continue;
    }
    out.push({ term, status: "missing", required, suggestion: `You don't have this in your profile.${required ? " It is listed as required." : ""}` });
  }
  return out.sort((a, b) => Number(b.required) - Number(a.required) || a.status.localeCompare(b.status)).slice(0, 25);
}
