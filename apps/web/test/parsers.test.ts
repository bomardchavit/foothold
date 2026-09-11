import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseResumeHeuristic, toYM } from "@/lib/llm/tasks/parseResume.heuristic";
import { parseJobHeuristic, extractYears, extractSalary, detectRemote, sectionize } from "@/lib/llm/tasks/parseJob.heuristic";

const resume = (name: string) => readFileSync(path.resolve(__dirname, "../../../data/seed/resumes", name), "utf8");

describe("heuristic résumé parser", () => {
  it("parses a standard single-column résumé", () => {
    const p = parseResumeHeuristic(resume("priya_natarajan.txt"));
    expect(p.contact.fullName).toBe("Priya Natarajan");
    expect(p.contact.email).toBe("priya.natarajan@example.com");
    expect(p.contact.location).toBe("San Francisco, CA");
    expect(p.experience.map((e) => e.company)).toEqual(["Sable Payments", "Fernweh", "Northwind Labs"]);
    expect(p.experience[0]).toMatchObject({ title: "Software Engineer II", startDate: "2022-06", isCurrent: true });
    expect(p.experience[0].bullets.length).toBe(5);
    expect(p.experience[1]).toMatchObject({ startDate: "2020-07", endDate: "2022-05", isCurrent: false });
    expect(p.education[0]).toMatchObject({ school: "University of Illinois Urbana-Champaign", gpa: "3.7" });
    expect(p.education[0].field).toMatch(/Computer Science/);
    expect(p.projects.length).toBe(2);
    expect(p.skills).toEqual(expect.arrayContaining(["Python", "TypeScript", "Django", "AWS", "PostgreSQL"]));
  });
  it("handles a PM résumé with em-dash headers and a summary", () => {
    const p = parseResumeHeuristic(resume("marcus_bell.txt"));
    expect(p.contact.fullName).toBe("Marcus Bell");
    expect(p.summary).toMatch(/Product manager with 6 years/);
    expect(p.experience[0]).toMatchObject({ company: "Oakhaven Enterprise", title: "Senior Product Manager, Growth", isCurrent: true });
    expect(p.experience.length).toBe(3);
    expect(p.skills).toEqual(expect.arrayContaining(["A/B Testing", "SQL", "Amplitude", "Figma"]));
  });
  it("handles education-first layouts with 'to' date ranges", () => {
    const p = parseResumeHeuristic(resume("elena_ortiz.txt"));
    expect(p.contact.fullName).toBe("Elena Ortiz");
    expect(p.experience[0]).toMatchObject({ title: "Data Analyst", company: "Greenfield Grocers", startDate: "2023-06", isCurrent: true });
    expect(p.education.length).toBe(1);
    expect(p.skills).toEqual(expect.arrayContaining(["Python", "R", "SQL", "dbt", "Snowflake"]));
  });
  it("normalizes date tokens", () => {
    expect(toYM("Jan 2020")).toBe("2020-01"); expect(toYM("06/2021")).toBe("2021-06"); expect(toYM("2019")).toBe("2019"); expect(toYM("Present")).toBeNull();
  });
});

describe("heuristic job parser", () => {
  const description = `About Acme\nAcme builds payments infrastructure for marketplaces: payment processing, lending and money movement for fintech platforms.\n\nWhat you'll do\n• Build APIs in Go\n\nWhat we're looking for\n• 4+ years of professional software engineering experience\n• Strong experience with Go and PostgreSQL\n• Working knowledge of Kubernetes, Kafka\n\nNice to have\n• Experience with Rust\n• Terraform\n\nCompensation\nThe base salary range for this role is $150,000 - $190,000 per year.`;
  it("separates required and preferred skills by section", () => {
    const j = parseJobHeuristic({ title: "Senior Backend Engineer", description, location: "Remote (US)" });
    expect(j.requiredSkills).toEqual(expect.arrayContaining(["Go", "PostgreSQL", "Kubernetes", "Kafka"]));
    expect(j.requiredSkills).not.toContain("Rust");
    expect(j.preferredSkills).toEqual(expect.arrayContaining(["Rust", "Terraform"]));
    expect(j.yearsMin).toBe(4);
    expect(j.seniority).toBe("SENIOR");
    expect(j.isRemote).toBe(true);
    expect(j).toMatchObject({ salaryMin: 150000, salaryMax: 190000, salaryPeriod: "year" });
    expect(j.industry).toBe("Fintech");
  });
  it("does not treat role descriptors in titles as requirements", () => {
    const j = parseJobHeuristic({ title: "Full-Stack Engineer", description: "Requirements\n• React and Node.js", location: null });
    expect(j.requiredSkills).not.toContain("Full-Stack Development");
    expect(j.requiredSkills).toEqual(expect.arrayContaining(["React", "Node.js"]));
  });
  it("extracts years ranges, hourly pay and hybrid", () => {
    expect(extractYears("3-5 years of experience in data")).toEqual({ yearsMin: 3, yearsMax: 5 });
    expect(extractYears("no numbers here")).toEqual({ yearsMin: null, yearsMax: null });
    expect(extractSalary("Pay: $40 - $55 per hour")).toMatchObject({ salaryMin: 40, salaryMax: 55, salaryPeriod: "hour" });
    expect(extractSalary("$120k–$160k plus equity")).toMatchObject({ salaryMin: 120000, salaryMax: 160000 });
    expect(detectRemote("Engineer", "Austin, TX", "This role is hybrid, three days a week in the office.")).toBe(false);
    expect(detectRemote("Engineer (Remote)", null, "")).toBe(true);
  });
  it("sectionizes headers with colons", () => {
    const s = sectionize("Requirements:\nA\nBonus points:\nB\nAbout us:\nC\nResponsibilities:\nD");
    expect(s.required).toBe("A"); expect(s.preferred).toBe("B"); expect(s.boilerplate).toBe("C"); expect(s.other).toBe("D");
  });
});

describe("cleanTitle", () => {
  it("drops trailing separators and an unclosed parenthetical the employer left in the title", async () => {
    const { cleanTitle } = await import("@/lib/ingest/normalize");
    expect(cleanTitle("Senior Software Engineer, Backend (Institutional - ")).toBe("Senior Software Engineer, Backend");
    expect(cleanTitle("Staff Engineer - ")).toBe("Staff Engineer");
    expect(cleanTitle("Software Engineer (Remote)")).toBe("Software Engineer (Remote)");
    expect(cleanTitle("Product Manager, Connect")).toBe("Product Manager, Connect");
  });
});

describe("round-2 parser fixes", () => {
  it("does not mine the employer's own intro paragraph for preferred skills, and never lists the employer as a skill", async () => {
    const { parseJobHeuristic } = await import("@/lib/llm/tasks/parseJob.heuristic");
    const description = [
      "Anduril is committed to bringing cutting-edge autonomy, AI, computer vision, sensor fusion and networking to the mission.",
      "About the role",
      "You will build logistics tooling for our program managers using Datadog dashboards.",
      "Requirements",
      "- 5+ years managing supply chains",
      "- Experience with SQL",
    ].join("\n");
    const p = parseJobHeuristic({ title: "Logistics Program Manager", description, company: "Anduril" });
    expect(p.preferredSkills).not.toContain("Computer Vision");
    expect(p.requiredSkills).not.toContain("Anduril");
    const d = parseJobHeuristic({ title: "Software Engineer", description: "Requirements\n- Experience with Datadog and Python", company: "Datadog" });
    expect(d.requiredSkills).toContain("Python");
    expect(d.requiredSkills).not.toContain("Datadog");
  });
  it("keeps 'Assembly' for the language and 'Computer Science Fundamentals' for the phrase, not for assembly lines or a degree line", async () => {
    const { extractSkills } = await import("@foothold/shared");
    expect(extractSkills("raw material to internal assembly lines; PCBA fabrication & assembly")).not.toContain("Assembly");
    expect(extractSkills("firmware in C, Rust, Assembly")).toContain("Assembly");
    expect(extractSkills("x86 assembly and inline assembly")).toContain("Assembly");
    expect(extractSkills("BS in Computer Science or equivalent")).not.toContain("Computer Science Fundamentals");
    expect(extractSkills("strong CS fundamentals and data structures and algorithms")).toContain("Computer Science Fundamentals");
    expect(extractSkills("troubleshooting printers")).not.toContain("Incident Response");
  });
  it("reads monthly salary ranges as monthly", async () => {
    const { extractSalary } = await import("@/lib/llm/tasks/parseJob.heuristic");
    const s = extractSalary("Monthly Salary Range $21,691 — $24,604 USD for this short-term role.");
    expect(s).toMatchObject({ salaryMin: 21691, salaryMax: 24604, salaryPeriod: "month" });
    expect(extractSalary("Annual base salary range: $150,000 - $190,000 USD").salaryPeriod).toBe("year");
  });
  it("treats the Coinbase generative-AI bullet as boilerplate", async () => {
    const { parseJobHeuristic } = await import("@/lib/llm/tasks/parseJob.heuristic");
    const p = parseJobHeuristic({ title: "Staff Software Engineer, Exchange", description: "What you'll be doing\n- Build matching engines in Go\n- Utilizes generative AI responsibly, maintaining human oversight\nRequirements\n- 8+ years with Go", company: "Coinbase" });
    expect(p.requiredSkills).not.toContain("LLMs");
    expect(p.preferredSkills).not.toContain("LLMs");
  });
  it("spam patterns need scam phrasing, not product mentions", async () => {
    const { computeQualityFlags, QUALITY_FLAGS } = await import("@/lib/ingest/quality");
    const base = { postedAt: new Date(), lastSeenAt: new Date(), salaryMin: 200000, salaryMax: 300000, salaryPeriod: "year", companyDomain: "vercel.com", sourceKind: "GREENHOUSE" };
    const filler = " You will work with a senior team on production systems, own services end to end, and ship weekly. ".repeat(3);
    expect(computeQualityFlags({ ...base, description: "eve integrates with Slack, WhatsApp and Telegram so agents can reach customers." + filler })).not.toContain(QUALITY_FLAGS.SPAM_PATTERN);
    expect(computeQualityFlags({ ...base, description: "We handle wire payments and the Wire protocol; a merchant processing fee applies." + filler })).not.toContain(QUALITY_FLAGS.SPAM_PATTERN);
    expect(computeQualityFlags({ ...base, description: "No interview. Contact us on WhatsApp +1 415 555 0199 to start today." + filler })).toContain(QUALITY_FLAGS.SPAM_PATTERN);
    expect(computeQualityFlags({ ...base, description: "A small training fee is required before you start." + filler })).toContain(QUALITY_FLAGS.SPAM_PATTERN);
  });
  it("location edge cases from live boards", async () => {
    const { parseLocation } = await import("@foothold/shared");
    expect(parseLocation("Remote-Friendly, United States")).toMatchObject({ city: null, country: "US", isRemote: true });
    expect(parseLocation("Remote - US: Select locations")).toMatchObject({ city: null, country: "US" });
    expect(parseLocation("New York City, NY")).toMatchObject({ city: "New York", region: "NY", country: "US" });
    expect(parseLocation("San Francisco Bay Area")).toMatchObject({ city: "San Francisco", region: "CA", country: "US" });
    expect(parseLocation("Remote - Washington D.C.")).toMatchObject({ city: "Washington", region: "DC", country: "US" });
  });
});
