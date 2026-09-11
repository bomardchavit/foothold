import { test, expect } from "@playwright/test";
import path from "node:path";
import { signIn, RESUMES, expectOnFeed } from "./helpers";

test("a new user uploads a résumé and gets a correct structured profile", async ({ page }) => {
  const email = `e2e-onboard-${Date.now()}@foothold.local`;
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByTestId("resume-file").setInputFiles(path.join(RESUMES, "elena_ortiz.txt"));
  await expect(page.getByTestId("upload-status")).toContainText("Parsed", { timeout: 60_000 });
  await expect(page).toHaveURL(/step=review/, { timeout: 30_000 });

  // Parsed structure is shown, editable, and correct
  await expect(page.getByTestId("full-name")).toHaveValue("Elena Ortiz");
  const titles = page.getByTestId("experience-title");
  await expect(titles.first()).toHaveValue("Data Analyst");
  await expect(page.getByTestId("experience-company").first()).toHaveValue("Greenfield Grocers");
  await expect(page.getByTestId("experience-item")).toHaveCount(3);
  await expect(page.getByTestId("education-item")).toHaveCount(1);
  await expect(page.locator('[data-testid="tag"][data-value="Python"]')).toHaveCount(1);
  // Manual edit of a parsed field
  await page.getByTestId("full-name").fill("Elena M. Ortiz");
  await page.getByTestId("save-profile").click();
  await expect(page).toHaveURL(/step=preferences/);

  await page.getByTestId("target-roles").fill("Data Scientist");
  await page.getByTestId("target-roles").press("Enter");
  await page.getByTestId("locations").fill("Chicago, IL");
  await page.getByTestId("locations").press("Enter");
  await page.getByTestId("seniority").selectOption("MID");
  await page.getByTestId("save-preferences").click();
  await expect(page).toHaveURL(/step=done/);
  await page.getByTestId("go-to-feed").click();
  await expectOnFeed(page);
  await expect(page.getByTestId("fit-bar").first()).toBeVisible();
});
