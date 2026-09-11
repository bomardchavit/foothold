import { test, expect } from "@playwright/test";
import { signIn, expectOnFeed } from "./helpers";

test("the seeded profile sees ranked jobs with an interrogable score breakdown", async ({ page }) => {
  await signIn(page, "demo@foothold.local");
  await page.goto("/feed");
  await expectOnFeed(page);
  const count = Number((await page.getByTestId("feed-count").textContent())?.match(/\d+/)?.[0]);
  expect(count).toBeGreaterThan(50);

  // Cards never show a bare number: the segmented bar is present
  const first = page.getByTestId("match-card").first();
  await expect(first.getByTestId("fit-bar")).toBeVisible();
  const total = Number((await first.getByTestId("fit-total").textContent())?.match(/\d+/)?.[0]);
  expect(total).toBeGreaterThanOrEqual(60);

  // Open the job: full breakdown with all six components and evidence
  await first.getByTestId("match-title").click();
  await expect(page.getByTestId("breakdown-panel")).toBeVisible();
  const legend = page.getByTestId("fit-legend");
  for (const label of ["Skills overlap", "Profile relevance", "Seniority fit", "Experience fit", "Industry fit", "Location fit"]) await expect(legend).toContainText(label);
  await expect(page.getByTestId("skill-have").first()).toBeVisible();

  // Filters: raising the threshold shrinks the list; H-1B filter works
  await page.goto("/feed?min=80");
  const filtered = Number((await page.getByTestId("feed-count").textContent())?.match(/\d+/)?.[0]);
  expect(filtered).toBeLessThan(count);
  await page.goto("/feed?h1b=YES");
  await expect(page.getByTestId("h1b-badge").first()).toContainText("sponsors");
  // Low-quality listings hidden by default, visible on toggle
  await page.goto("/feed");
  await expect(page.getByTestId("feed-count")).toContainText("hidden as low quality");
  await page.goto("/feed?lowq=1");
  await expect(page.getByTestId("quality-flag").first()).toBeVisible();
});

test("the copilot answers 'why do I match' with citations", async ({ page }) => {
  await signIn(page, "demo@foothold.local");
  await page.goto("/feed");
  await page.getByTestId("match-title").first().click();
  await page.getByTestId("ask-why").click();
  await expect(page.getByTestId("copilot-panel")).toBeVisible();
  await expect(page.getByTestId("citation-chip").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("grounding-status")).toBeVisible();
  const chips = await page.getByTestId("citation-chip").count();
  expect(chips).toBeGreaterThan(3);
});
