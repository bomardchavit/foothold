import { describe, it, expect } from "vitest";
import { parseLocation } from "@foothold/shared";
import { inScope } from "@/lib/ingest/normalize";

describe("job country scope (JOBS_COUNTRIES default US)", () => {
  const ok = (loc: string | null, remote = false) => inScope(parseLocation(loc), remote);
  it("keeps US, remote and unplaceable postings", () => {
    expect(ok("San Francisco, CA")).toBe(true);
    expect(ok("US-ATL, US-CHI")).toBe(true);
    expect(ok("Remote", true)).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok("Headquarters")).toBe(true);
  });
  it("drops postings placed in other countries", () => {
    expect(ok("Toronto")).toBe(false);
    expect(ok("London, United Kingdom")).toBe(false);
    expect(ok("Bengaluru")).toBe(false);
    expect(ok("Dublin, Ireland")).toBe(false);
  });
});
