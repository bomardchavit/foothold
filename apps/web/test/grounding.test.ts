import { describe, it, expect } from "vitest";
import { checkGrounding, allowedFromProfile } from "@/lib/copilot/grounding";
import { classifyText } from "@/lib/resume/tailor";
import { resolveContent } from "@/lib/resume/build";
import type { CtxLine } from "@/lib/copilot/context";
import type { FullProfile } from "@/lib/profile/service";
import type { ResumeContent } from "@foothold/shared";

const profile = {
  headline: "Backend engineer", summary: null, fullName: "Priya N", targetRoles: [], skills: [{ name: "Python" }, { name: "PostgreSQL" }],
  experiences: [{ id: "e1", company: "Sable Payments", title: "Software Engineer II", bullets: [{ id: "b1", text: "Cut p95 latency from 840ms to 210ms by adding Redis caching." }] }],
  projects: [], educations: [{ school: "UIUC", degree: "B.S.", field: "CS" }],
} as unknown as FullProfile;
const lines = new Map<string, CtxLine>([
  ["P1", { id: "P1", kind: "P", label: "Skills", text: "Python, PostgreSQL" }],
  ["P2", { id: "P2", kind: "P", label: "bullet", text: "Cut p95 latency from 840ms to 210ms by adding Redis caching." }],
  ["J1", { id: "J1", kind: "J", label: "Required", text: "Kubernetes, Python" }],
]);
const allowed = allowedFromProfile(profile);

describe("copilot grounding checker", () => {
  it("accepts cited, true claims", () => {
    const r = checkGrounding("You have Python [P1], which the posting requires [J1]. You cut p95 latency from 840ms to 210ms [P2].", lines, allowed, { requireCitations: true });
    expect(r.status).toBe("GROUNDED");
  });
  it("rejects claimed skills that are not in the profile", () => {
    const r = checkGrounding("You have deep Kubernetes experience [P1].", lines, allowed, { requireCitations: true });
    expect(r.status).toBe("REJECTED");
    expect(r.flags[0].reason).toMatch(/Kubernetes/);
  });
  it("rejects invented numbers and invalid citations", () => {
    expect(checkGrounding("You reduced costs by 37% [P2].", lines, allowed, { requireCitations: true }).status).toBe("REJECTED");
    expect(checkGrounding("You have Python [P99].", lines, allowed, { requireCitations: true }).flags.some((f) => /P99/.test(f.reason))).toBe(true);
  });
  it("flags uncited claims as partial, ignores advice and (general) sentences", () => {
    expect(checkGrounding("You have Python experience.", lines, allowed, { requireCitations: true }).status).toBe("PARTIAL");
    expect(checkGrounding("Consider adding Kubernetes to your profile. (general) Most companies ask about system design.", lines, allowed, { requireCitations: true }).status).toBe("GROUNDED");
  });
  it("allows negated mentions of missing skills", () => {
    expect(checkGrounding("You do not list Kubernetes, which is required [J1].", lines, allowed, { requireCitations: true }).status).toBe("GROUNDED");
  });
});

describe("tailoring classifier", () => {
  const src = "Cut p95 latency from 840ms to 210ms by adding Redis caching.";
  it("keeps grounded rewrites grounded", () => { expect(classifyText("Reduced p95 latency 840ms→210ms with Redis caching on PostgreSQL-backed services.", src, allowed).grounded).toBe(true); });
  it("labels new tools or numbers as ungrounded", () => {
    expect(classifyText("Reduced latency 75% using Kafka.", src, allowed).issues).toEqual(expect.arrayContaining([expect.stringMatching(/Kafka/), expect.stringMatching(/75%/)]));
  });
});

describe("resolveContent", () => {
  const content: ResumeContent = {
    header: { fullName: "P", email: null, phone: null, location: null, links: [] }, headline: null, summary: null, education: [], projects: [],
    experience: [{ experienceId: "e1", company: "C", title: "T", location: null, dateRange: "", bullets: [
      { bulletId: "b1", text: "new text", sourceText: "old text", changeKind: "reworded", reason: null, keywords: [], grounded: true },
      { bulletId: "b2", text: "expanded text", sourceText: "old2", changeKind: "expanded", reason: null, keywords: [], grounded: false },
      { bulletId: "added-1", text: "brand new", sourceText: "", changeKind: "added", reason: null, keywords: [], grounded: false },
    ] }],
    skills: [{ name: "Python", grounded: true, changeKind: "unchanged", reason: null }, { name: "Kafka", grounded: false, changeKind: "added", reason: null }],
  };
  it("grounded-only strips expanded/added content and reverts to source", () => {
    const r = resolveContent(content, {}, true);
    expect(r.experience[0].bullets.map((b) => b.text)).toEqual(["new text", "old2"]);
    expect(r.skills.map((s) => s.name)).toEqual(["Python"]);
  });
  it("rejected decisions revert or drop", () => {
    const r = resolveContent(content, { b1: false, "added-1": false, "skill:Kafka": false }, false);
    expect(r.experience[0].bullets.map((b) => b.text)).toEqual(["old text", "expanded text"]);
    expect(r.skills.length).toBe(1);
  });
});
