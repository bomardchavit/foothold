/**
 * robots.txt compliance (RFC 9309). Every HTML/undocumented-endpoint fetch goes through isAllowed().
 * 404/410 and 401/403 ("unavailable", RFC 9309 §2.3.1.3) mean the site publishes no rules for us: allow. Unreachable robots
 * (network error / 5xx) is treated as "do not crawl" for 30 minutes.
 */
export const BOT_TOKEN = "FootholdBot";
export const BOT_UA = `${BOT_TOKEN}/0.1 (+https://github.com/foothold-app; job aggregator; ${process.env.SCRAPER_CONTACT ?? "no-contact-configured"})`;

interface Rule { allow: boolean; rx: RegExp; len: number }
export interface Rules { rules: Rule[]; crawlDelay: number | null; sitemaps: string[]; status: "ok" | "none" | "error" }
const cache = new Map<string, { rules: Rules; at: number }>();
const TTL = 30 * 60_000;

function pathToRegex(p: string): RegExp {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

export function parseRobots(text: string): Rules {
  const groups: Array<{ agents: string[]; rules: Rule[]; crawlDelay: number | null }> = [];
  const sitemaps: string[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "sitemap") { sitemaps.push(val); continue; }
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if ((key === "allow" || key === "disallow") && val) cur.rules.push({ allow: key === "allow", rx: pathToRegex(val), len: val.length });
    if (key === "crawl-delay") { const n = Number(val); if (Number.isFinite(n)) cur.crawlDelay = n; }
  }
  const mine = groups.find((g) => g.agents.some((a) => a === BOT_TOKEN.toLowerCase() || BOT_TOKEN.toLowerCase().startsWith(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  const g = mine ?? star;
  return { rules: g?.rules ?? [], crawlDelay: g?.crawlDelay ?? null, sitemaps, status: "ok" };
}

export async function getRules(origin: string): Promise<Rules> {
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < TTL) return hit.rules;
  let rules: Rules;
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": BOT_UA }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
    if (res.status === 404 || res.status === 410 || res.status === 401 || res.status === 403) rules = { rules: [], crawlDelay: null, sitemaps: [], status: "none" };
    else if (res.ok) rules = parseRobots(await res.text());
    else rules = { rules: [{ allow: false, rx: /^\//, len: 1 }], crawlDelay: null, sitemaps: [], status: "error" };
  } catch {
    rules = { rules: [{ allow: false, rx: /^\//, len: 1 }], crawlDelay: null, sitemaps: [], status: "error" };
  }
  cache.set(origin, { rules, at: Date.now() });
  return rules;
}

/** Longest-match wins; on a tie Allow wins (RFC 9309 §2.2.2). */
export function evaluate(rules: Rules, pathWithQuery: string): boolean {
  let best: Rule | null = null;
  for (const r of rules.rules) if (r.rx.test(pathWithQuery) && (!best || r.len > best.len || (r.len === best.len && r.allow && !best.allow))) best = r;
  return best ? best.allow : true;
}

export async function isAllowed(url: string | URL): Promise<boolean> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) return false;
  return evaluate(await getRules(u.origin), u.pathname + u.search);
}

export async function crawlDelayMs(origin: string): Promise<number> {
  const r = await getRules(origin);
  return Math.min(60_000, Math.max(0, (r.crawlDelay ?? 0) * 1000));
}

export async function sitemapsFor(origin: string): Promise<string[]> { return (await getRules(origin)).sitemaps; }
