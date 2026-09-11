import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test("tailor a résumé for a job, see the diff, export PDF and DOCX, track the application", async ({ page }) => {
  await signIn(page, "demo@foothold.local");
  await page.goto("/feed");
  await page.getByTestId("match-title").first().click();
  await page.getByTestId("tailor-button").click();
  await page.waitForURL(/\/resumes\/[a-z0-9]+$/, { timeout: 120_000 });

  await expect(page.getByTestId("resume-preview")).toBeVisible();
  await expect(page.getByTestId("resume-preview")).toContainText("Priya Natarajan");
  await page.getByTestId("tab-changes").click();
  // No fabricated employers/titles: structure is locked to the profile
  await expect(page.getByTestId("resume-preview")).toContainText("Sable Payments");

  const docId = page.url().split("/").pop()!;
  const pdf = await page.request.get(`/api/resume/${docId}/export?format=pdf`);
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).length).toBeGreaterThan(1500);
  const docx = await page.request.get(`/api/resume/${docId}/export?format=docx&grounded=1`);
  expect(docx.ok()).toBeTruthy();
  expect(docx.headers()["content-type"]).toContain("wordprocessingml");

  await page.getByTestId("use-for-application").click();
  await expect(page.getByTestId("use-for-application")).toContainText("Attached");
  await page.goto("/tracker");
  await expect(page.getByTestId("application-card").first()).toBeVisible();
  await page.getByTestId("application-card").first().click();
  await expect(page.getByTestId("application-drawer")).toContainText("résumé");
  await page.getByTestId("status-APPLIED").click();
  await expect(page.getByTestId("timeline")).toContainText("Applied");
  await page.getByTestId("note-input").fill("Recruiter screen next Tuesday");
  await page.getByTestId("add-note").click();
  await expect(page.getByTestId("application-drawer")).toContainText("Recruiter screen next Tuesday");
});
