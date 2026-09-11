import { BOT_UA } from "./robots";

/** Renders a JS-heavy page with headless Chromium (Playwright) when it is installed; returns null otherwise. */
let browserP: Promise<import("playwright").Browser | null> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

async function browser() {
  if (!browserP) {
    browserP = (async () => {
      try { const pw = await import("playwright"); return await pw.chromium.launch({ headless: true }); }
      catch (e) { console.warn("[render] Playwright/Chromium unavailable (run `npx playwright install chromium`):", e instanceof Error ? e.message.split("\n")[0] : e); return null; }
    })();
  }
  return browserP;
}
function scheduleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { const b = await browserP; browserP = null; await b?.close().catch(() => {}); }, 60_000);
}

export async function renderPage(url: string, timeoutMs = 30_000): Promise<string | null> {
  const b = await browser();
  if (!b) return null;
  const ctx = await b.newContext({ userAgent: BOT_UA, javaScriptEnabled: true, viewport: { width: 1280, height: 900 } });
  try {
    await ctx.route("**/*", (route) => (["image", "media", "font", "stylesheet"].includes(route.request().resourceType()) ? route.abort() : route.continue()));
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return await page.content();
  } catch (e) {
    console.warn("[render] failed", url, e instanceof Error ? e.message.split("\n")[0] : e);
    return null;
  } finally { await ctx.close().catch(() => {}); scheduleClose(); }
}
