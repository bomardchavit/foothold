import { ParsedResumeSchema, canonicalizeSkill, type ParsedResume } from "@foothold/shared";
import { llmMode, structured, type LlmMode } from "../client";
import { env } from "../../env";
import { parseResumeHeuristic } from "./parseResume.heuristic";

const SYSTEM = `You extract structured data from résumés. Return every field exactly as written in the résumé; never invent, infer, or embellish.
Rules:
- Dates as YYYY-MM when a month is present, else YYYY. isCurrent=true when the end is "Present".
- Keep bullet text verbatim (fix only broken line wraps). One bullet per accomplishment.
- experience: paid roles, internships, research positions. projects: personal/academic projects.
- skills: every technology, tool, language, framework, method or domain skill listed anywhere in the résumé, as short names.
- If a field is absent, use null (or an empty list). Do not guess a phone number, email, or GPA.
- headline: the candidate's own title line if present, else null.`;

function postProcess(p: ParsedResume): ParsedResume {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const s of p.skills) { const c = canonicalizeSkill(s); if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); skills.push(c); } }
  return { ...p, skills, experience: p.experience.map((e) => ({ ...e, bullets: e.bullets.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean) })) };
}

export async function parseResume(rawText: string, userId?: string | null): Promise<{ parsed: ParsedResume; mode: LlmMode }> {
  const mode = llmMode();
  if (mode === "heuristic") return { parsed: postProcess(parseResumeHeuristic(rawText)), mode };
  try {
    const out = await structured({
      task: "parseResume", schema: ParsedResumeSchema, system: SYSTEM, userId,
      model: env.modelMain, effort: "medium", maxTokens: 12000,
      user: `Résumé text:\n\n<resume>\n${rawText.slice(0, 60000)}\n</resume>`,
    });
    return { parsed: postProcess(out), mode };
  } catch (e) {
    console.warn("[parseResume] LLM parse failed, falling back to heuristic:", e instanceof Error ? e.message : e);
    return { parsed: postProcess(parseResumeHeuristic(rawText)), mode: "heuristic" };
  }
}
