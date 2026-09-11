import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const RESUMES = path.resolve(__dirname, "../../../data/seed/resumes");

/** Dev login (DEV_LOGIN=true): creates the account if needed. */
export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByTestId("dev-email").fill(email);
  await page.getByTestId("dev-login").click();
  await page.waitForURL(/\/(feed|onboarding)/, { timeout: 30_000 });
}

export async function expectOnFeed(page: Page) {
  await expect(page.getByTestId("match-list")).toBeVisible();
  await expect(page.getByTestId("match-card").first()).toBeVisible();
}
