import { BOT_UA } from "./robots";

/**
 * Renders a JS-heavy page with headless Chromium (Playwright) when it is installed. Rendering is opt-in per process
 * (SCRAPER_RENDER=1: the CLI and the worker turn it on; the web server never launches a browser) and capped per crawl.
 */
let browserP: Promise<import("playwright").Browser | null> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

export function renderEnabled(): boolean { return process.env.SCRAPER_RENDER === "1"; }

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
  if (!renderEnabled()) return null;
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

/** Per-crawl render budget: at most `max` Chromium page loads, none at all when rendering is off. */
export function renderBudget(max = Number(process.env.SCRAPER_MAX_RENDERS ?? 10)) {
  let left = renderEnabled() ? max : 0;
  return {
    get left() { return left; },
    async render(url: string): Promise<string | null> {
      if (left <= 0) return null;
      left--;
      return renderPage(url);
    },
  };
}
