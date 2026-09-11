import { describe, it, expect } from "vitest";
import { parseRobots, evaluate } from "@/lib/ingest/crawl/robots";
import { extractJobPostings, jsonLdBlocks } from "@/lib/ingest/crawl/jsonld";
import { detectEmploymentType, detectWorkplaceType } from "@foothold/shared";

describe("robots.txt", () => {
  const rules = parseRobots(`
User-agent: *
Disallow: /private/
Allow: /private/jobs
Crawl-delay: 5
Sitemap: https://example.com/sitemap.xml

User-agent: FootholdBot
Disallow: /internal/
`);
  it("picks our own group when present and keeps sitemaps", () => {
    expect(evaluate(rules, "/internal/x")).toBe(false);
    expect(evaluate(rules, "/private/anything")).toBe(true); // not in our group
    expect(rules.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });
  it("applies longest match with Allow winning ties for the * group", () => {
    const star = parseRobots("User-agent: *\nDisallow: /private/\nAllow: /private/jobs\nDisallow: /*.pdf$");
    expect(evaluate(star, "/private/secret")).toBe(false);
    expect(evaluate(star, "/private/jobs/123")).toBe(true);
    expect(evaluate(star, "/files/a.pdf")).toBe(false);
    expect(evaluate(star, "/files/a.pdfx")).toBe(true);
    expect(evaluate(star, "/jobs")).toBe(true);
  });
});

describe("JSON-LD JobPosting extraction", () => {
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Senior Backend Engineer","description":"<p>Build <b>payments</b> systems in Go.</p><ul><li>5+ years</li></ul>","datePosted":"2026-09-01","validThrough":"2099-01-01","employmentType":["FULL_TIME"],"hiringOrganization":{"@type":"Organization","name":"Acme Corp","sameAs":"https://www.acme.com"},"jobLocation":{"@type":"Place","address":{"addressLocality":"Austin","addressRegion":"TX","addressCountry":"US"}},"baseSalary":{"@type":"MonetaryAmount","currency":"USD","value":{"@type":"QuantitativeValue","minValue":150000,"maxValue":190000,"unitText":"YEAR"}},"identifier":{"@type":"PropertyValue","name":"Acme","value":"REQ-42"},"url":"https://www.acme.com/careers/req-42"}</script>
<script type="application/ld+json">{"@graph":[{"@type":"JobPosting","title":"Expired role","description":"Long enough description text for the expired role to count.","validThrough":"2020-01-01"},{"@type":"JobPosting","title":"Remote Data Analyst","description":"Analyze data for our marketplace team, remote anywhere in the US, using SQL and Python daily.","jobLocationType":"TELECOMMUTE","employmentType":"CONTRACTOR","hiringOrganization":"Beta Inc"}]}</script></head></html>`;
  it("maps fields, skips expired postings, handles @graph and TELECOMMUTE", () => {
    expect(jsonLdBlocks(html).length).toBe(2);
    const jobs = extractJobPostings(html, "https://www.acme.com/careers");
    expect(jobs.length).toBe(2);
    expect(jobs[0]).toMatchObject({ externalId: "REQ-42", title: "Senior Backend Engineer", company: "Acme Corp", companyDomain: "acme.com", location: "Austin, TX, US", employmentType: "FULL_TIME", salaryMin: 150000, salaryMax: 190000, salaryPeriod: "year", applyUrl: "https://www.acme.com/careers/req-42", postedAt: "2026-09-01" });
    expect(jobs[0].description).toContain("Build payments systems in Go.");
    expect(jobs[0].description).toContain("• 5+ years");
    expect(jobs[1]).toMatchObject({ title: "Remote Data Analyst", isRemote: true, employmentType: "CONTRACT", company: "Beta Inc" });
  });
  it("ignores malformed blocks", () => { expect(extractJobPostings('<script type="application/ld+json">{not json</script>', "https://x.com")).toEqual([]); });
});

describe("employment and workplace detection", () => {
  const long = "x".repeat(300);
  it("detects internships, contracts and defaults to full-time", () => {
    expect(detectEmploymentType("Software Engineering Intern", long)).toBe("INTERNSHIP");
    expect(detectEmploymentType("Designer (Contract)", long)).toBe("CONTRACT");
    expect(detectEmploymentType("Analyst", "Part-time role, 20 hours per week. " + long)).toBe("PART_TIME");
    expect(detectEmploymentType("Engineer", long)).toBe("FULL_TIME");
    expect(detectEmploymentType("Engineer", "short")).toBe("UNKNOWN");
  });
  it("detects hybrid, remote and onsite", () => {
    expect(detectWorkplaceType("Engineer", "New York, NY", "This is a hybrid role, 3 days a week in the office.")).toBe("HYBRID");
    expect(detectWorkplaceType("Engineer", "Remote - US", "")).toBe("REMOTE");
    expect(detectWorkplaceType("Engineer (Remote)", null, "We are remote-first.")).toBe("REMOTE");
    expect(detectWorkplaceType("Engineer", "Austin, TX", "On-site in our Austin office.")).toBe("ONSITE");
    expect(detectWorkplaceType("Engineer", "Austin, TX", "")).toBe("ONSITE");
    expect(detectWorkplaceType("Engineer", null, "")).toBe("UNKNOWN");
  });
});

describe("poll scheduling", () => {
  it("polls API boards on the fast cadence, crawls slowly, and backs a failing source off", async () => {
    const { pollIntervalMin } = await import("@/lib/ingest/run");
    const base = { intervalMin: 10, failureCount: 0 };
    expect(pollIntervalMin({ ...base, kind: "GREENHOUSE" })).toBe(10);
    expect(pollIntervalMin({ ...base, kind: "ASHBY" })).toBe(10);
    expect(pollIntervalMin({ ...base, kind: "CAREERS" })).toBe(60);
    expect(pollIntervalMin({ ...base, kind: "WORKDAY" })).toBe(20);
    // a board that keeps failing is retried later and later, never more often than the floor
    expect(pollIntervalMin({ ...base, kind: "GREENHOUSE", failureCount: 1 })).toBe(20);
    expect(pollIntervalMin({ ...base, kind: "GREENHOUSE", failureCount: 3 })).toBe(80);
    expect(pollIntervalMin({ ...base, kind: "GREENHOUSE", failureCount: 12 })).toBe(240);
  });
});

describe("conditional polling", () => {
  it("greenhouse asks for the index, reports 304 as not-modified, and versions each posting", async () => {
    const { greenhouse } = await import("@/lib/ingest/sources/greenhouse");
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> });
      if ((init?.headers as Record<string, string>)?.["If-None-Match"] === 'W/"same"') return new Response(null, { status: 304 });
      return new Response(JSON.stringify({ jobs: [{ id: 1, updated_at: "2026-09-11T10:00:00Z" }, { id: 2, updated_at: "2026-09-10T10:00:00Z" }] }), { status: 200, headers: { "content-type": "application/json", etag: 'W/"same"' } });
    }) as typeof fetch;
    try {
      const fresh = await greenhouse.poll!({ slug: "acme", name: "Acme", etag: null });
      expect(fresh.kind).toBe("index");
      if (fresh.kind === "index") {
        expect(fresh.entries).toEqual([{ externalId: "1", version: "2026-09-11T10:00:00Z" }, { externalId: "2", version: "2026-09-10T10:00:00Z" }]);
        expect(fresh.etag).toBe('W/"same"');
      }
      const boardCall = calls.find((c) => c.url.includes("/boards/acme/jobs"))!;
      expect(boardCall).toBeTruthy();
      expect(boardCall.url).not.toContain("content=true"); // the index, not the 12x larger document
      const again = await greenhouse.poll!({ slug: "acme", name: "Acme", etag: 'W/"same"' });
      expect(again.kind).toBe("not-modified");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("ATS discovery guards", () => {
  it("never guesses a BambooHR subdomain: a shared ATS board carries no company name to check", async () => {
    const discover = await import("@/lib/ingest/discover");
    const src = (await import("node:fs")).readFileSync(new URL("../src/lib/ingest/discover.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/kind: "BAMBOOHR"/);
    expect(typeof discover.discoverSources).toBe("function");
  });
});
