import { expandImplied, extractSkills, isTechnicalSkill, isEmployerSkill, skillMentioned, type MatchBreakdown } from "@foothold/shared";
import type { CtxLine } from "./context";

export type Intent = "why" | "gaps" | "cover" | "interview" | "apply" | "job" | "greeting" | "general";
export function detectIntent(q: string): Intent {
  const s = q.toLowerCase().trim();
  if (/^(?:hi|hello|hey|yo|good (?:morning|afternoon|evening)|thanks?|thank you|ok|okay)\b[!. ]*$/.test(s)) return "greeting";
  if (/cover letter/.test(s)) return "cover";
  if (/interview|prep/.test(s)) return "interview";
  if (/should i apply|worth applying|apply\?/.test(s)) return "apply";
  if (/salary|pay|compensation|comp\b|benefit|equity|bonus|remote|hybrid|on-?site|location|where is|visa|sponsor|h-?1b|years of experience|how many years|level|seniority|full[- ]time|part[- ]time|intern|contract/.test(s)) return "job";
  if (/gap|missing|lack|weak|improve|what am i missing/.test(s)) return "gaps";
  if (/why|match|fit|good for me|strength/.test(s)) return "why";
  return "general";
}

/** Order missing skills so real technical gaps (languages, frameworks, tools) come before domain words; drop the employer's own name. */
function rankMissing(list: string[], company: string | null): string[] {
  const clean = list.filter((s) => !isEmployerSkill(s, company));
  return [...clean.filter(isTechnicalSkill), ...clean.filter((s) => !isTechnicalSkill(s))];
}

interface Ctx { profile: CtxLine[]; job: CtxLine[]; match: CtxLine[]; breakdown: MatchBreakdown | null; candidateName: string; jobTitle: string | null; company: string | null }

function skillLine(profile: CtxLine[], skill: string): CtxLine | undefined {
  const low = skill.toLowerCase();
  return profile.find((l) => l.ref?.type === "bullet" && extractSkills(l.text).some((s) => s.toLowerCase() === low)) ?? profile.find((l) => l.ref?.type === "skills" && l.text.toLowerCase().split(/,\s*/).includes(low));
}
const jobLineFor = (job: CtxLine[], skill: string) => job.find((l) => l.label !== "Role" && skillMentioned(skill, l.text));
const mLine = (match: CtxLine[], label: string) => match.find((l) => l.label === label);

/** Deterministic, fully cited answers used when no Anthropic key is configured (and as the e2e baseline). */
export function answerHeuristic(intent: Intent, ctx: Ctx): string {
  const { profile, job, match, breakdown: b } = ctx;
  const name = ctx.candidateName.split(" ")[0] || "you";
  if (!b || !ctx.jobTitle) {
    const skills = profile.filter((l) => l.ref?.type === "skills");
    const roles = profile.filter((l) => l.ref?.type === "experience");
    return [
      `Here is a quick read of your profile, ${name}.`,
      roles.length ? `You have ${roles.length} roles listed, most recently ${roles[0].text.split(" (")[0]} ${cite(roles[0])}.` : "You have no roles listed yet, so add experience to get stronger matches.",
      skills.length ? `Your listed skills include ${skills[0].text} ${cite(skills[0])}.` : "",
      `Open a job from your matches and ask me why you match it, what your gaps are, or for a cover letter or interview prep.`,
    ].filter(Boolean).join("\n\n");
  }
  const role = job[0];
  const total = mLine(match, "Overall fit");
  const skillsC = b.components.find((c) => c.key === "skills");
  const matched = b.matchedSkills.slice(0, 6).map((s) => ({ s, p: skillLine(profile, s), j: jobLineFor(job, s) }));
  const missingReq = rankMissing(b.missingRequired, ctx.company);
  const missingPref = rankMissing(b.missingPreferred, ctx.company);
  const missingLine = mLine(match, "Missing required skills");
  const missingPrefLine = mLine(match, "Missing preferred skills");

  if (intent === "greeting") {
    return `Hi ${name}. I can only talk about what is in your profile and this posting, so ask me why you match ${ctx.jobTitle} at ${ctx.company} ${cite(role)}, what your gaps are, whether to apply, or for a cover letter or interview prep.`;
  }
  if (intent === "job") {
    const lines = [`What the posting says about ${ctx.jobTitle} at ${ctx.company} ${cite(role)}:`];
    const roleText = role?.text ?? "";
    const salary = /Salary ([^.]+)\./.exec(roleText);
    lines.push(salary ? `• Pay: ${salary[1]} ${cite(role)}.` : `• Pay: the posting does not state a salary range ${cite(role)}.`);
    const head = roleText.split(/\. Level:/)[0];
    const at = head.indexOf(` at ${ctx.company}`);
    const locRaw = at >= 0 ? head.slice(at + ` at ${ctx.company}`.length).replace(/^,\s*/, "").replace(/\s*\(remote\)\s*$/, "").trim() : "";
    lines.push(`• Location: ${locRaw || "not stated"}${/\(remote\)/.test(head) ? ", remote-friendly" : ""} ${cite(role)}.`);
    const level = /Level: ([^.]+)\./.exec(roleText);
    const years = /Years: ([^.]+)\./.exec(roleText);
    lines.push(`• Level: ${level ? level[1] : "not stated"}${years ? `, ${years[1]} years` : ""} ${cite(role)}.`);
    const sponsor = job.find((l) => l.label === "Sponsorship");
    lines.push(sponsor ? `• Sponsorship: ${sponsor.text} ${cite(sponsor)}` : `• Sponsorship: no H-1B filing history found for this employer in the USCIS data, so treat sponsorship as unknown.`);
    const benefits = job.filter((l) => l.label === "Posting" && /\b(401\(k\)|health|dental|vision|pto|paid time off|parental|equity|stock|rsu|bonus|benefits)\b/i.test(l.text)).slice(0, 3);
    if (benefits.length) lines.push(`• Benefits mentioned: ${benefits.map((l) => `"${l.text.slice(0, 100)}" ${cite(l)}`).join("; ")}`);
    lines.push(`(general) Anything not listed above is not in the posting, so ask the recruiter rather than assuming.`);
    return lines.join("\n");
  }
  const implied = expandImplied(profile.filter((l) => l.ref?.type === "skills").flatMap((l) => l.text.split(/,\s*/)));

  if (intent === "why") {
    const lines = [
      `You score ${b.total}/100 for ${ctx.jobTitle} at ${ctx.company} ${cite(total)}, ${cite(role)}. Here is what drives it:`,
      ...matched.filter((m) => m.p).map((m) => `• You have ${m.s} ${cite(m.p!)}, which the posting asks for ${cite(m.j ?? job[1])}.`),
      ...b.components.filter((c) => c.key !== "skills" && c.status === "scored" && c.score >= 70).map((c) => `• ${c.label}: ${c.evidence[0]} ${cite(mLine(match, c.label))}`),
      skillsC ? `Skills overlap is ${skillsC.score}/100 ${cite(mLine(match, "Skills overlap"))}.` : "",
      missingReq.length ? `The main thing holding the score down: the posting also asks for ${missingReq.slice(0, 4).join(", ")} ${cite(missingLine)}, which is not in your profile. Ask me about gaps for what to do about that.` : `Nothing required by the posting is missing from your profile ${cite(mLine(match, "Matched skills"))}.`,
    ];
    return lines.filter(Boolean).join("\n");
  }
  if (intent === "gaps") {
    if (!missingReq.length && !missingPref.length) return `No gaps against the listed skills: every required and preferred skill appears in your profile ${cite(mLine(match, "Matched skills"))}. The remaining differences are level and location, if any: ${b.components.filter((c) => c.status === "scored" && c.score < 70).map((c) => `${c.label} ${c.score}/100 ${cite(mLine(match, c.label))}`).join("; ") || "none"}.`;
    const lines = [`Gaps for ${ctx.jobTitle} at ${ctx.company} ${cite(role)}:`];
    for (const s of missingReq.slice(0, 6)) {
      const via = [...implied].find((i) => i.toLowerCase() === s.toLowerCase());
      const evidence = profile.find((l) => l.ref?.type === "bullet" && skillMentioned(s, l.text));
      lines.push(`• Required: ${s} ${cite(jobLineFor(job, s) ?? job[1])}. ${via ? `You do not list it ${cite(missingLine)}, but related tools in your profile imply it; make it explicit.` : evidence ? `Your bullet "${evidence.text.slice(0, 70)}…" ${cite(evidence)} is the closest evidence; it does not name ${s}.` : `You don't have this in your profile ${cite(missingLine)}. If you have used it, add it; if not, it is a real gap.`}`);
    }
    for (const s of missingPref.slice(0, 4)) lines.push(`• Preferred: ${s} ${cite(jobLineFor(job, s) ?? job[2] ?? job[1])}. Not in your profile ${cite(missingPrefLine)}; optional for this role.`);
    for (const c of b.components) if (c.status === "scored" && c.score < 70 && c.key !== "skills") lines.push(`• ${c.label}: ${c.evidence[0]} ${cite(mLine(match, c.label))}`);
    return lines.join("\n");
  }
  if (intent === "cover") {
    const strongest = profile.filter((l) => l.ref?.type === "bullet").slice(0, 3);
    const roleLine = profile.find((l) => l.ref?.type === "experience");
    return [
      `Dear ${ctx.company} hiring team,`,
      `I am applying for the ${ctx.jobTitle} role ${cite(role)}. ${roleLine ? `I am currently ${roleLine.text.split(" (")[0]} ${cite(roleLine)}.` : ""}`,
      strongest.length ? `Some relevant work: ${strongest.map((s) => `${s.text.replace(/\.$/, "")} ${cite(s)}`).join("; ")}.` : "",
      matched.length ? `The posting asks for ${matched.slice(0, 4).map((m) => m.s).join(", ")} ${cite(matched[0].j ?? job[1])}, all of which I have used ${matched.filter((m) => m.p).slice(0, 3).map((m) => cite(m.p!)).join(" ")}.` : "",
      missingReq.length ? `I have not yet worked with ${missingReq.slice(0, 2).join(" or ")}; I would ramp up on it quickly given my adjacent experience.` : "",
      `I would welcome a conversation about how I can contribute.\n\nSincerely,\n${ctx.candidateName}`,
    ].filter(Boolean).join("\n\n");
  }
  if (intent === "interview") {
    const reqs = job.filter((l) => l.label === "Posting" && /\b(experience|years|strong|knowledge|ability|responsib|own|build|design|lead)\b/i.test(l.text)).slice(0, 5);
    const lines = [`Likely interview themes for ${ctx.jobTitle} at ${ctx.company} ${cite(role)}, with the story from your profile to use for each:`];
    for (const r of reqs) {
      const sk = extractSkills(r.text)[0];
      const story = sk ? skillLine(profile, sk) : undefined;
      lines.push(`• "${r.text.slice(0, 110)}" ${cite(r)} → ${story ? `use: ${story.text.slice(0, 120)} ${cite(story)}` : "you do not have a matching bullet; prepare an honest answer about how you would learn this."}`);
    }
    lines.push(`(general) Expect a behavioral round and a technical or case round; prepare two-minute stories with a measurable result and practice explaining trade-offs out loud.`);
    return lines.join("\n");
  }
  if (intent === "apply") {
    const verdict = b.total >= 75 ? "Yes, apply." : b.total >= 55 ? "Yes, but address the gaps in your application." : "Probably not yet, unless the gaps below are easy to close.";
    return [
      `${verdict} Your fit is ${b.total}/100 ${cite(total)}.`,
      `For you: ${b.components.filter((c) => c.status === "scored" && c.score >= 70).map((c) => `${c.label} ${c.score} ${cite(mLine(match, c.label))}`).join(", ") || "not much yet"}.`,
      `Against you: ${b.components.filter((c) => c.status === "scored" && c.score < 70).map((c) => `${c.label} ${c.score} ${cite(mLine(match, c.label))}`).join(", ") || "nothing significant"}.`,
      missingReq.length ? `Missing required skills: ${missingReq.slice(0, 6).join(", ")} ${cite(missingLine)}.` : "",
    ].filter(Boolean).join("\n\n");
  }
  // general: an on-topic default that says what it can answer instead of pretending the question was "why do I match"
  return [
    `I can only answer from your profile and this posting, so here is the short version for ${ctx.jobTitle} at ${ctx.company} ${cite(role)}: your fit is ${b.total}/100 ${cite(total)}.`,
    matched.filter((m) => m.p).length ? `You already have ${matched.filter((m) => m.p).slice(0, 4).map((m) => `${m.s} ${cite(m.p!)}`).join(", ")}.` : "",
    missingReq.length ? `Not in your profile: ${missingReq.slice(0, 4).join(", ")} ${cite(missingLine)}.` : "",
    `Ask me why you match, what your gaps are, whether to apply, about pay or location, or for a cover letter or interview prep.`,
  ].filter(Boolean).join("\n\n");
}

const cite = (l: CtxLine | undefined) => (l ? `[${l.id}]` : "");
