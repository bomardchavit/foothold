import { BOT_UA, isAllowed, crawlDelayMs } from "./robots";

/**
 * Polite HTTP: identifies itself, respects robots.txt and Crawl-delay, one request at a time per host,
 * backs off on 429/503 (honouring Retry-After). No proxy or user-agent rotation: a block is reported, not evaded.
 */
export class RobotsDisallowed extends Error { constructor(url: string) { super(`robots.txt disallows ${url}`); } }
export class Blocked extends Error { constructor(url: string, status: number) { super(`Blocked (${status}) at ${url}; not retrying`); } }

const MIN_DELAY_MS = Number(process.env.SCRAPER_MIN_DELAY_MS ?? 1500);
/**
 * Documented JSON job APIs are built for programmatic clients and answer from a CDN, so they get a shorter floor than
 * the 1.5s used when crawling someone's website. Still one request at a time per host, still backs off on 429/503.
 */
const API_DELAY_MS = Number(process.env.SCRAPER_API_DELAY_MS ?? 800);
const API_HOSTS = /^(?:boards-api\.greenhouse\.io|api\.lever\.co|api\.ashbyhq\.com|api\.smartrecruiters\.com|apply\.workable\.com|data\.usajobs\.gov|api\.adzuna\.com)$/i;
export const hostDelayFloor = (hostname: string) => (API_HOSTS.test(hostname) ? API_DELAY_MS : MIN_DELAY_MS);
const hosts = new Map<string, { nextAt: number; chain: Promise<unknown> }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function slot(origin: string, delayMs: number): Promise<void> {
  const st = hosts.get(origin) ?? { nextAt: 0, chain: Promise.resolve() };
  const run = st.chain.then(async () => { const wait = st.nextAt - Date.now(); if (wait > 0) await sleep(wait); st.nextAt = Date.now() + delayMs; });
  st.chain = run.catch(() => {});
  hosts.set(origin, st);
  await run;
}

export interface PoliteInit { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number; skipRobots?: boolean; retries?: number }

export async function politeFetch(url: string, init: PoliteInit = {}): Promise<Response> {
  const u = new URL(url);
  if (!init.skipRobots && !(await isAllowed(u))) throw new RobotsDisallowed(url);
  const delay = Math.max(hostDelayFloor(u.hostname), await crawlDelayMs(u.origin));
  const retries = init.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    await slot(u.origin, delay);
    let res: Response;
    try {
      res = await fetch(url, { method: init.method ?? "GET", headers: { "User-Agent": BOT_UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.8", ...(init.headers ?? {}) }, body: init.body, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000), redirect: "follow" });
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(1000 * 2 ** attempt); continue;
    }
    if (res.status === 429 || res.status === 503) {
      if (attempt >= retries) throw new Blocked(url, res.status);
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Math.min(60_000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt)); continue;
    }
    if (res.status === 401 || res.status === 403) throw new Blocked(url, res.status);
    if (res.status >= 500 && attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
    return res;
  }
}

export async function politeText(url: string, init?: PoliteInit): Promise<string> {
  const res = await politeFetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}
export async function politeJson<T>(url: string, init?: PoliteInit): Promise<T> {
  const res = await politeFetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}
