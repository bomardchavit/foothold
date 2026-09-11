import { describe, it, expect } from "vitest";
import { scoreMatch } from "@foothold/shared";
import { checkGrounding, allowedFromProfile } from "@/lib/copilot/grounding";
import { answerHeuristic, detectIntent, type Intent } from "@/lib/copilot/heuristic";
import { buildProfileLines, buildJobLines, buildMatchLines, linesMap } from "@/lib/copilot/context";
import type { FullProfile } from "@/lib/profile/service";
import type { JobWithCompany } from "@/lib/matching/service";

// A realistic profile/job pair shaped like the Stripe "Backend Engineer, Core Technology" case from the audit:
// the posting asks for Java, C, C++ which the candidate does not have, so every intent has real gaps to talk about.
const profile = {
  fullName: "Priya Natarajan", headline: "Backend engineer", summary: "Six years building payment services.", location: "Chicago, IL",
  targetRoles: ["Backend Engineer", "Software Engineer"], locations: ["Chicago, IL"], remotePref: "ANY", seniority: "MID", yearsExperience: 6.2,
  workAuth: "H1B", needsSponsorship: true, salaryFloor: null, industries: ["Fintech"],
  skills: [{ name: "Python" }, { name: "PostgreSQL" }, { name: "Redis" }, { name: "Go" }, { name: "Kubernetes" }],
  experiences: [{ id: "e1", company: "Sable Payments", title: "Software Engineer II", location: "Chicago, IL", startDate: "2020-03", endDate: null, current: true,
    bullets: [{ id: "b1", text: "Cut p95 latency from 840ms to 210ms by adding Redis caching in front of PostgreSQL." }, { id: "b2", text: "Designed and shipped a ledger reconciliation service in Python and Go processing 4M events a day." }] }],
  projects: [], educations: [{ id: "ed1", school: "UIUC", degree: "B.S.", field: "Computer Science", endDate: new Date("2019-05-01"), gpa: null }],
} as unknown as FullProfile;

const job = {
  id: "j1", title: "Backend Engineer, Core Technology", location: "Chicago, IL", city: "Chicago", region: "IL", country: "US", isRemote: false,
  seniority: "MID", employmentType: "FULL_TIME", yearsMin: 4, yearsMax: null, salaryMin: 160000, salaryMax: 210000, salaryCurrency: "USD", salaryPeriod: "year",
  requiredSkills: ["Java", "C", "C++", "Algorithms", "PostgreSQL", "Redis"], preferredSkills: ["Kafka"], industry: "Fintech",
  description: "You will build core infrastructure.\nWe require strong experience with Java, C, C++ and algorithms.\nBenefits include 401(k) matching and health coverage.\nWe offer equity and a bonus.",
  company: { name: "Stripe", h1bSignal: "YES", h1bMatchedName: "Stripe, Inc.", h1bApprovals: 412, h1bYears: [2023, 2024] },
} as unknown as JobWithCompany;

function build(intent: Intent) {
  const breakdown = scoreMatch(
    { skills: profile.skills.map((s) => s.name), seniority: "MID", yearsExperience: 6.2, industries: ["Fintech"], locations: ["Chicago, IL"], remotePref: "ANY", targetRoles: profile.targetRoles },
    { title: job.title, requiredSkills: job.requiredSkills, preferredSkills: job.preferredSkills, seniority: "MID", yearsMin: 4, yearsMax: null, industry: "Fintech", isRemote: false, location: job.location, city: "Chicago", region: "IL", country: "US", employmentType: "FULL_TIME" },
    0.2, "local",
  );
  const p = buildProfileLines(profile), j = buildJobLines(job), m = buildMatchLines(breakdown);
  const text = answerHeuristic(intent, { profile: p, job: j, match: m, breakdown, candidateName: profile.fullName ?? "", jobTitle: job.title, company: job.company.name });
  const report = checkGrounding(text, linesMap([...p, ...j, ...m]), allowedFromProfile(profile), { requireCitations: true });
  return { text, report };
}

describe("heuristic copilot answers pass the grounding checker", () => {
  for (const intent of ["why", "gaps", "apply", "cover", "interview", "job", "general", "greeting"] as Intent[]) {
    it(`${intent} answer is GROUNDED`, () => {
      const { text, report } = build(intent);
      expect(report.flags.map((f) => `${f.reason} :: ${f.sentence}`)).toEqual([]);
      expect(report.status).toBe("GROUNDED");
      expect(text.length).toBeGreaterThan(20);
    });
  }
  it("'why' names the missing skills as a job claim, not as candidate experience", () => {
    const { text } = build("why");
    expect(text).toMatch(/asks for .*Java/);
  });
  it("'job' answers pay, location, level and sponsorship from the posting", () => {
    const { text } = build("job");
    expect(text).toMatch(/Pay: 160,000–210,000 USD\/year \[J1\]/);
    expect(text).toMatch(/Location: Chicago, IL/);
    expect(text).toMatch(/Sponsorship: USCIS data shows Stripe, Inc\./);
    expect(text).toMatch(/401\(k\)/);
  });
  it("gap bullets carry citations and evidence never comes from a substring of another word", () => {
    const { text } = build("gaps");
    // "C" must not be 'evidenced' by the letter c inside "Cut p95 latency…"
    expect(text).not.toMatch(/Required: C \[J\d+\]\. Your bullet/);
    expect(text).toMatch(/Required: Java \[J\d+\]\. You don't have this in your profile \[M\d+\]/);
  });
});

describe("intent detection", () => {
  it("routes pay/location/visa questions to the job intent and greetings to greeting", () => {
    expect(detectIntent("What is the salary range for this job?")).toBe("job");
    expect(detectIntent("Is this remote?")).toBe("job");
    expect(detectIntent("Do they sponsor H1B?")).toBe("job");
    expect(detectIntent("hello")).toBe("greeting");
    expect(detectIntent("Why do I match?")).toBe("why");
    expect(detectIntent("what are my gaps")).toBe("gaps");
    expect(detectIntent("tell me about the weather")).toBe("general");
  });
});
