import { test, expect } from "@playwright/test";
import { signIn, expectOnFeed } from "./helpers";

test("the seeded profile sees ranked jobs with an interrogable score breakdown", async ({ page }) => {
  await signIn(page, "demo@foothold.local");
  await page.goto("/jobs");
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
  await page.goto("/jobs?min=80");
  const filtered = Number((await page.getByTestId("feed-count").textContent())?.match(/\d+/)?.[0]);
  expect(filtered).toBeLessThan(count);
  await page.goto("/jobs?h1b=YES");
  await expect(page.getByTestId("h1b-badge").first()).toContainText(/sponsor/i);
  // Low-quality listings hidden by default, visible on toggle
  await page.goto("/jobs");
  await expect(page.getByTestId("feed-count")).toContainText("hidden as low quality");
  await page.goto("/jobs?lowq=1");
  await expect(page.getByTestId("quality-flag").first()).toBeVisible();
});

test("the copilot answers 'why do I match' with citations", async ({ page }) => {
  await signIn(page, "demo@foothold.local");
  await page.goto("/jobs");
  await page.getByTestId("ask-why").first().click();
  await expect(page.getByTestId("copilot-panel")).toBeVisible();
  await expect(page.getByTestId("citation-chip").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("grounding-status")).toBeVisible();
  const chips = await page.getByTestId("citation-chip").count();
  expect(chips).toBeGreaterThan(3);
});

test("liking, hiding, tabs and saved filters work on the jobs workspace", async ({ page }) => {
  await signIn(page, "demo@foothold.local");
  await page.goto("/jobs?q=Solutions");
  const first = page.getByTestId("match-card").first();
  const jobId = await first.getAttribute("data-job-id");
  await first.getByTestId("like-job").click();
  await expect(first.getByTestId("like-job")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("tab-liked").click();
  await expect(page).toHaveURL(/tab=liked/);
  await expect(page.locator(`[data-job-id="${jobId}"]`)).toBeVisible();
  await page.getByTestId("tab-recommended").click();
  await expect(page.locator(`[data-job-id="${jobId}"]`)).toBeVisible();
  await page.locator(`[data-job-id="${jobId}"]`).getByTestId("hide-job").click();
  await expect(page.locator(`[data-job-id="${jobId}"]`)).toHaveCount(0);
  await page.getByTestId("chip-hidden").click();
  await expect(page).toHaveURL(/hidden=1/);
  await expect(page.locator(`[data-job-id="${jobId}"]`)).toBeVisible();
  await page.locator(`[data-job-id="${jobId}"]`).getByTestId("hide-job").click(); // restore
  await expect(page.locator(`[data-job-id="${jobId}"]`)).toHaveCount(0);
  await page.goto("/jobs?work=REMOTE&type=FULL_TIME");
  await page.getByTestId("save-filter").click();
  await page.getByTestId("save-filter-name").fill("Remote full-time");
  await page.getByTestId("save-filter-name").press("Enter");
  await expect(page).toHaveURL(/sf=/);
  await expect(page.getByTestId("saved-filters")).toContainText("Remote full-time");
});
