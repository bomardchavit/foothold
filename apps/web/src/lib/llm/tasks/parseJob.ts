import { JobParsedSchema, canonicalizeSkill, type JobParsed } from "@foothold/shared";
import { llmMode, structured } from "../client";
import { env } from "../../env";
import { parseJobHeuristic } from "./parseJob.heuristic";

const SYSTEM = `You extract structured hiring requirements from a job posting. Be literal: only list skills the posting actually names.
- requiredSkills: technologies, tools, methods, or domain skills the posting requires (short canonical names, e.g. "React", "PostgreSQL", "A/B Testing"). Skip soft skills.
- preferredSkills: items marked nice-to-have, preferred, bonus, or plus.
- yearsMin/yearsMax: years of experience requested, null if not stated.
- seniority: one of INTERN, ENTRY, MID, SENIOR, STAFF, PRINCIPAL, MANAGER, DIRECTOR, EXECUTIVE, UNKNOWN.
- isRemote: true only if the role can be done fully remotely. Hybrid = false.
- salary: numeric annual (or hourly with salaryPeriod="hour") range if stated, else null.
- industry: the employer's industry in a few words, or null.`;

export async function parseJob(input: { title: string; description: string; location?: string | null; userId?: string | null }): Promise<{ parsed: JobParsed; mode: string }> {
  const heuristic = parseJobHeuristic(input);
  if (llmMode() === "heuristic") return { parsed: heuristic, mode: "heuristic" };
  try {
    const out = await structured({
      task: "parseJob", schema: JobParsedSchema, system: SYSTEM, model: env.modelBulk, maxTokens: 4000, userId: input.userId,
      user: `Title: ${input.title}\nLocation: ${input.location ?? "n/a"}\n\n<posting>\n${input.description.slice(0, 30000)}\n</posting>`,
    });
    const req = [...new Set(out.requiredSkills.map(canonicalizeSkill))];
    const pref = [...new Set(out.preferredSkills.map(canonicalizeSkill))].filter((s) => !req.includes(s));
    return {
      parsed: {
        ...out,
        requiredSkills: req.length ? req : heuristic.requiredSkills,
        preferredSkills: pref,
        yearsMin: out.yearsMin ?? heuristic.yearsMin, yearsMax: out.yearsMax ?? heuristic.yearsMax,
        seniority: out.seniority === "UNKNOWN" ? heuristic.seniority : out.seniority,
        salaryMin: out.salaryMin ?? heuristic.salaryMin, salaryMax: out.salaryMax ?? heuristic.salaryMax,
        salaryCurrency: out.salaryCurrency ?? heuristic.salaryCurrency, salaryPeriod: out.salaryPeriod ?? heuristic.salaryPeriod,
        industry: out.industry ?? heuristic.industry,
      },
      mode: llmMode(),
    };
  } catch (e) {
    console.warn("[parseJob] LLM failed, using heuristic:", e instanceof Error ? e.message : e);
    return { parsed: heuristic, mode: "heuristic" };
  }
}
