import { describe, it, expect } from "vitest";
import { canonicalizeSkill, extractSkills, expandImplied, skillCategory } from "../src/skills";
import { normalizeCompanyName, stripHtml, simhash, hammingDistance, numericTokens, splitLines } from "../src/text";
import { parseLocation } from "../src/location";
import { inferSeniorityFromTitle, inferJobSeniority } from "../src/seniority";
import { inferIndustry, industriesAdjacent } from "../src/industries";

describe("skills", () => {
  it("canonicalizes aliases", () => {
    expect(canonicalizeSkill("ReactJS")).toBe("React");
    expect(canonicalizeSkill("k8s")).toBe("Kubernetes");
    expect(canonicalizeSkill("golang")).toBe("Go");
    expect(canonicalizeSkill("Postgres")).toBe("PostgreSQL");
    expect(canonicalizeSkill("Something Unknown")).toBe("Something Unknown");
  });
  it("extracts skills at word boundaries, including tricky tokens", () => {
    const s = extractSkills("Built services in Go and C++ with Node.js, C#, .NET and R programming; deployed on AWS (EKS). Go to market fast.");
    expect(s).toEqual(expect.arrayContaining(["Go", "C++", "Node.js", "C#", ".NET", "R", "AWS", "EKS"]));
    expect(extractSkills("We go to the store and rest.")).not.toContain("Go");
    expect(extractSkills("we go to the store")).not.toContain("REST APIs");
  });
  it("does not match substrings", () => {
    expect(extractSkills("Javascripting is fun")).not.toContain("JavaScript");
    expect(extractSkills("asp.net core")).toContain("ASP.NET");
  });
  it("expands implications transitively", () => {
    const set = expandImplied(["Next.js"]);
    expect(set.has("React")).toBe(true);
    expect(set.has("JavaScript")).toBe(true);
  });
  it("categorizes", () => { expect(skillCategory("Figma")).toBe("DESIGN"); expect(skillCategory("Leadership")).toBe("SOFT"); });
});

describe("text", () => {
  it("normalizes company names for joins with the USCIS file", () => {
    expect(normalizeCompanyName("Google LLC")).toBe("google");
    expect(normalizeCompanyName("META PLATFORMS, INC.")).toBe("meta platforms");
    expect(normalizeCompanyName("The Northwind Labs Inc")).toBe("northwind labs");
    expect(normalizeCompanyName("Amazon.com Services LLC")).toBe("amazon com services");
  });
  it("strips html keeping breaks and entities", () => {
    expect(stripHtml("<p>Hello &amp; <b>world</b></p><ul><li>one</li><li>two</li></ul>")).toBe("Hello & world\n• one\n• two");
  });
  it("simhash is stable and near for near-duplicates", () => {
    const a = "We are hiring a backend engineer to build payment systems in Go and Postgres with a great team. You will own services end to end, design schemas, ship features weekly, and mentor junior engineers while working closely with product and design.";
    const b = "We are hiring a backend engineer to build payment systems in Go and Postgres with an amazing team. You will own services end to end, design schemas, ship features weekly, and mentor junior engineers while working closely with product and design.";
    expect(simhash(a)).toBe(simhash(a));
    expect(hammingDistance(simhash(a), simhash(b))).toBeLessThanOrEqual(10);
    expect(hammingDistance(simhash(a), simhash(a + " Apply today."))).toBeLessThanOrEqual(8);
    expect(hammingDistance(simhash(a), simhash("Product designer for a mobile app studio in Los Angeles working on onboarding flows, design systems and user research with a small team of engineers and product managers."))).toBeGreaterThan(14);
  });
  it("extracts numeric tokens", () => { expect(numericTokens("Cut p95 from 840ms to 210ms, saving $1.2M (40%)")).toEqual(["95", "840", "210", "1.2m", "40%"]); });
  it("splits long paragraphs into sentences, keeps short ones whole", () => { expect(splitLines("• First bullet.\nA short paragraph. Two sentences.").length).toBe(2); expect(splitLines("A".repeat(150) + ". Second sentence here that is long enough to matter. Third one too.").length).toBe(3); });
});

describe("location", () => {
  it("parses city/state/country and remote", () => {
    expect(parseLocation("San Francisco, CA")).toMatchObject({ city: "San Francisco", region: "CA", country: "US", isRemote: false });
    expect(parseLocation("Remote (US)")).toMatchObject({ isRemote: true, country: "US" });
    expect(parseLocation("Remote - New York, NY")).toMatchObject({ isRemote: true, city: "New York", region: "NY" });
    expect(parseLocation("London, United Kingdom").country).toBe("GB");
    expect(parseLocation("Austin").region).toBe("TX");
    expect(parseLocation("Austin, TX · London, United Kingdom (Hybrid)")).toMatchObject({ city: "Austin", region: "TX", country: "US" });
    expect(parseLocation("London, United Kingdom · Austin, TX").country).toBe("GB");
  });
});

describe("seniority + industry", () => {
  it("infers from titles", () => {
    expect(inferSeniorityFromTitle("Senior Software Engineer")).toBe("SENIOR");
    expect(inferSeniorityFromTitle("Staff Engineer")).toBe("STAFF");
    expect(inferSeniorityFromTitle("Software Engineer II")).toBe("MID");
    expect(inferSeniorityFromTitle("Engineering Manager")).toBe("MANAGER");
    expect(inferSeniorityFromTitle("Product Manager")).toBe("UNKNOWN");
    expect(inferSeniorityFromTitle("Software Engineering Intern")).toBe("INTERN");
    expect(inferJobSeniority("Software Engineer", 6)).toBe("SENIOR");
  });
  it("infers industry from text and knows adjacency", () => {
    expect(inferIndustry("We are a fintech building payments infrastructure for marketplaces")).toBe("Fintech");
    expect(industriesAdjacent("Fintech", "Finance / Banking")).toBe(true);
    expect(industriesAdjacent("Gaming", "Biotech / Pharma")).toBe(false);
  });
});
