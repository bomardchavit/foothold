import { describe, it, expect } from "vitest";
import { scoreMatch, computeYearsExperience, WEIGHTS, type ScoreProfileInput, type ScoreJobInput } from "../src/scoring";

const profile: ScoreProfileInput = { skills: ["Python", "Django", "PostgreSQL", "React"], seniority: "MID", yearsExperience: 4, industries: ["Fintech"], locations: ["San Francisco, CA"], remotePref: "ANY" };
const job: ScoreJobInput = { requiredSkills: ["Python", "PostgreSQL", "Kubernetes"], preferredSkills: ["React", "Go"], seniority: "MID", yearsMin: 3, yearsMax: 6, industry: "Fintech", isRemote: false, location: "San Francisco, CA", city: "San Francisco", region: "CA", country: "US" };

describe("scoreMatch", () => {
  it("scores skills as 75% required + 25% preferred with evidence", () => {
    const b = scoreMatch(profile, job, null, null);
    const sk = b.components.find((c) => c.key === "skills")!;
    expect(sk.score).toBe(Math.round((0.75 * 2 / 3 + 0.25 * 1 / 2) * 100));
    expect(b.missingRequired).toEqual(["Kubernetes"]);
    expect(b.missingPreferred).toEqual(["Go"]);
    expect(sk.evidence.join(" ")).toContain("Missing required: Kubernetes");
  });
  it("drops the semantic component when no embedding exists and renormalizes weights", () => {
    const b = scoreMatch(profile, job, null, null);
    const sem = b.components.find((c) => c.key === "semantic")!;
    expect(sem.status).toBe("na");
    expect(sem.weight).toBe(0);
    const sum = b.components.reduce((s, c) => s + c.weight, 0);
    expect(sum).toBeCloseTo(1, 2);
    expect(b.total).toBeGreaterThan(80);
  });
  it("counts implied skills for matching (Django implies Python) and reports it", () => {
    const b = scoreMatch({ ...profile, skills: ["Django"] }, { ...job, requiredSkills: ["Python"], preferredSkills: [] }, null, null);
    expect(b.matchedSkills).toEqual(["Python"]);
    expect(b.impliedMatches[0]).toEqual({ required: "Python", via: "Django" });
  });
  it("marks unknown job data as 50 and na for candidate 'any' preferences", () => {
    const b = scoreMatch({ ...profile, industries: [], locations: [], remotePref: "ANY" }, { ...job, industry: null, yearsMin: null, yearsMax: null, seniority: "UNKNOWN" }, null, null);
    expect(b.components.find((c) => c.key === "industry")!.status).toBe("na");
    expect(b.components.find((c) => c.key === "location")!.status).toBe("na");
    expect(b.components.find((c) => c.key === "years")!.score).toBe(50);
    expect(b.components.find((c) => c.key === "seniority")!.score).toBe(50);
  });
  it("penalizes years short by 25 per year and seniority two rungs apart", () => {
    const b = scoreMatch({ ...profile, yearsExperience: 1, seniority: "ENTRY" }, { ...job, yearsMin: 3, yearsMax: null, seniority: "STAFF" }, null, null);
    expect(b.components.find((c) => c.key === "years")!.score).toBe(50);
    expect(b.components.find((c) => c.key === "seniority")!.score).toBe(0);
  });
  it("maps cosine similarity through the provider calibration", () => {
    const hi = scoreMatch(profile, job, 0.9, "voyage").components.find((c) => c.key === "semantic")!;
    const lo = scoreMatch(profile, job, 0.3, "voyage").components.find((c) => c.key === "semantic")!;
    expect(hi.score).toBe(100); expect(lo.score).toBe(0);
  });
  it("blends title-vs-target-role fit into profile relevance and damps sparse skill lists", () => {
    const p = { ...profile, targetRoles: ["Backend Engineer"] };
    const eng = scoreMatch(p, { ...job, title: "Senior Backend Engineer" }, 0.9, "voyage").components.find((c) => c.key === "semantic")!;
    const tax = scoreMatch(p, { ...job, title: "Global Filing Specialist, Tax" }, 0.9, "voyage").components.find((c) => c.key === "semantic")!;
    expect(eng.score).toBe(100); expect(tax.score).toBe(50);
    const noEmb = scoreMatch(p, { ...job, title: "Software Developer" }, null, null).components.find((c) => c.key === "semantic")!;
    expect(noEmb.status).toBe("scored"); expect(noEmb.score).toBe(50);
    const sparse = scoreMatch(profile, { ...job, requiredSkills: ["Python"], preferredSkills: [] }, null, null).components.find((c) => c.key === "skills")!;
    expect(sparse.score).toBe(75);
  });
  it("location: same city 100, remote job 100, remote-only candidate on-site penalty", () => {
    expect(scoreMatch(profile, job, null, null).components.find((c) => c.key === "location")!.score).toBe(100);
    expect(scoreMatch(profile, { ...job, isRemote: true }, null, null).components.find((c) => c.key === "location")!.score).toBe(100);
    expect(scoreMatch({ ...profile, remotePref: "REMOTE" }, job, null, null).components.find((c) => c.key === "location")!.score).toBe(60);
  });
  it("weights sum to 1", () => { expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1); });
});

describe("computeYearsExperience", () => {
  const now = new Date(Date.UTC(2026, 8, 1));
  it("merges overlapping ranges and counts internships at half", () => {
    const y = computeYearsExperience([
      { startDate: "2020-01", endDate: "2022-01", isCurrent: false, title: "Engineer" },
      { startDate: "2021-01", endDate: "2023-01", isCurrent: false, title: "Engineer II" },
      { startDate: "2019-06", endDate: "2019-09", isCurrent: false, title: "Software Engineering Intern" },
    ], now);
    expect(y).toBeCloseTo(3 + 0.125, 1);
  });
  it("treats current roles as running to now", () => {
    expect(computeYearsExperience([{ startDate: "2025-09", endDate: null, isCurrent: true, title: "PM" }], now)).toBe(1);
  });
});

describe("level direction", () => {
  it("a posting one rung below the target costs more than one rung above; overshooting an explicit years cap is not a perfect fit", () => {
    const mid: ScoreProfileInput = { ...profile, seniority: "MID", yearsExperience: 6.2 };
    const newGrad = scoreMatch(mid, { ...job, seniority: "ENTRY", yearsMin: 0, yearsMax: 2 }, null, null);
    const senior = scoreMatch(mid, { ...job, seniority: "SENIOR", yearsMin: 5, yearsMax: null }, null, null);
    expect(newGrad.components.find((c) => c.key === "seniority")!.score).toBe(40);
    expect(senior.components.find((c) => c.key === "seniority")!.score).toBe(70);
    expect(newGrad.components.find((c) => c.key === "years")!.score).toBe(80);
    expect(senior.components.find((c) => c.key === "years")!.score).toBe(100);
    expect(newGrad.total).toBeLessThan(senior.total);
  });
});
