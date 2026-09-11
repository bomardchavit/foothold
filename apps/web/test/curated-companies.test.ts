import { describe, it, expect } from "vitest";
import { US_COMPANIES } from "@/lib/ingest/us-companies";

describe("curated US company list", () => {
  it("has no duplicate boards or domains and every board entry carries both kind and slug", () => {
    const boards = US_COMPANIES.filter((c) => c.kind || c.slug).map((c) => `${c.kind}:${c.slug}`);
    expect(new Set(boards).size).toBe(boards.length);
    const domains = US_COMPANIES.map((c) => c.domain.toLowerCase());
    expect(new Set(domains).size).toBe(domains.length);
    for (const c of US_COMPANIES) expect(Boolean(c.kind) === Boolean(c.slug), `${c.name} must have both kind and slug or neither`).toBe(true);
  });
  it("uses the verified board tokens for the corrected entries", () => {
    const byName = new Map(US_COMPANIES.map((c) => [c.name, c]));
    expect(byName.get("Anduril")).toMatchObject({ kind: "GREENHOUSE", slug: "andurilindustries" });
    expect(byName.get("Brex")).toMatchObject({ kind: "GREENHOUSE", slug: "brex" });
    expect(byName.get("Plaid")).toMatchObject({ kind: "ASHBY", slug: "plaid" });
    expect(byName.get("Benchling")).toMatchObject({ kind: "ASHBY", slug: "benchling" });
    expect(byName.get("Zapier")).toMatchObject({ kind: "ASHBY", slug: "zapier" });
    for (const n of ["Rippling", "Netlify", "Retool", "HashiCorp"]) expect(byName.get(n)?.kind, n).toBeUndefined();
  });
});
