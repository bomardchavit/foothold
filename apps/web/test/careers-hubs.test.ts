import { describe, it, expect } from "vitest";
import { looksJsRendered, selectHubs } from "@/lib/ingest/sources/careers";
import { renderBudget } from "@/lib/ingest/crawl/render";
import { isStale } from "@/lib/ingest/quality";

describe("careers crawl", () => {
  const prose = "We build tools for teams. ".repeat(80);
  it("spots JS-rendered shells and leaves server-rendered pages alone", () => {
    expect(looksJsRendered('<html><body><div id="root"></div><script src="/app.js"></script></body></html>')).toBe(true);
    expect(looksJsRendered(`<html><body><div id="root"><p>${prose.slice(0, 900)}</p></div><script id="__NEXT_DATA__">{}</script></body></html>`)).toBe(true);
    expect(looksJsRendered(`<html><body><main><h1>Careers</h1><p>${prose}</p></main></body></html>`)).toBe(false);
  });
  it("takes up to five listing hubs the site links to, and guesses conventional paths only when the start page linked to no job page", () => {
    const start = new URL("https://acme.example/careers");
    const linked = ["https://acme.example/careers/openings", "https://acme.example/jobs/search", "https://acme.example/jobs/123-engineer", "https://acme.example/careers/team/design"];
    expect(selectHubs(linked, start, linked.length)).toEqual(["https://acme.example/careers/openings", "https://acme.example/jobs/search"]);
    const guessed = selectHubs([], start, 0);
    expect(guessed).toEqual(["https://acme.example/jobs", "https://acme.example/jobs/search", "https://acme.example/careers/jobs", "https://acme.example/careers/openings", "https://acme.example/careers/search"]);
    const many = Array.from({ length: 9 }, (_, i) => `https://acme.example/jobs/${i}/openings`);
    expect(selectHubs(many, start, many.length).length).toBe(5);
  });
  it("never renders inside a process that did not opt in (SCRAPER_RENDER unset)", async () => {
    const prev = process.env.SCRAPER_RENDER;
    delete process.env.SCRAPER_RENDER;
    try {
      const budget = renderBudget(10);
      expect(budget.left).toBe(0);
      expect(await budget.render("https://acme.example/jobs")).toBeNull();
    } finally { if (prev !== undefined) process.env.SCRAPER_RENDER = prev; }
  });
});

describe("stale rule", () => {
  const day = 86400_000;
  const now = Date.now();
  it("never flags a posting the last crawl returned, however old its posted date", () => {
    expect(isStale({ postedAt: new Date(now - 200 * day), lastSeenAt: new Date(now - 1 * day), sourceKind: "GREENHOUSE" }, now)).toBe(false);
    expect(isStale({ postedAt: new Date(now - 200 * day), lastSeenAt: new Date(now - 8 * day), sourceKind: "GREENHOUSE" }, now)).toBe(true);
    expect(isStale({ postedAt: new Date(now - 10 * day), lastSeenAt: new Date(now - 15 * day), sourceKind: "GREENHOUSE" }, now)).toBe(true);
    expect(isStale({ postedAt: new Date(now - 10 * day), lastSeenAt: new Date(now - 10 * day), sourceKind: "GREENHOUSE" }, now)).toBe(false);
  });
  it("keeps the 60-day age rule for seed data, which has no crawl", () => {
    expect(isStale({ postedAt: new Date(now - 61 * day), lastSeenAt: new Date(now), sourceKind: "SEED" }, now)).toBe(true);
    expect(isStale({ postedAt: new Date(now - 59 * day), lastSeenAt: null, sourceKind: "SEED" }, now)).toBe(false);
  });
});
