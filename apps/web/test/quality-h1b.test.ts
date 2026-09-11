import { describe, it, expect } from "vitest";
import { computeQualityFlags } from "@/lib/ingest/quality";
import { currentFiscalYear } from "@/lib/h1b/signal";

const ok = "x".repeat(300);
describe("quality flags", () => {
  const base = { description: `${ok} We are hiring an engineer to build systems.`, postedAt: new Date(), salaryMin: 100000, salaryMax: 150000, salaryPeriod: "year", companyDomain: "acme.com", sourceKind: "GREENHOUSE" };
  it("passes a normal posting", () => { expect(computeQualityFlags(base)).toEqual([]); });
  it("flags stale, spam patterns, absurd salary spans and missing domains on aggregators", () => {
    expect(computeQualityFlags({ ...base, postedAt: new Date(Date.now() - 61 * 86400_000), lastSeenAt: new Date(Date.now() - 8 * 86400_000) })).toContain("STALE");
    expect(computeQualityFlags({ ...base, postedAt: new Date(Date.now() - 61 * 86400_000) })).not.toContain("STALE"); // just fetched: age alone never hides an open role
    expect(computeQualityFlags({ ...base, description: `${ok} Earn $500 per day from home, message us on WhatsApp, registration fee applies.` })).toContain("SPAM_PATTERN");
    expect(computeQualityFlags({ ...base, salaryMin: 20000, salaryMax: 250000 })).toContain("SPAM_PATTERN");
    expect(computeQualityFlags({ ...base, description: "Too short." })).toContain("SPAM_PATTERN");
    expect(computeQualityFlags({ ...base, companyDomain: null, sourceKind: "ADZUNA" })).toContain("NO_COMPANY_DOMAIN");
    expect(computeQualityFlags({ ...base, companyDomain: null, sourceKind: "GREENHOUSE" })).not.toContain("NO_COMPANY_DOMAIN");
  });
});
describe("fiscal year", () => {
  it("rolls over in October", () => {
    expect(currentFiscalYear(new Date(Date.UTC(2026, 8, 15)))).toBe(2026);
    expect(currentFiscalYear(new Date(Date.UTC(2026, 9, 1)))).toBe(2027);
  });
});
