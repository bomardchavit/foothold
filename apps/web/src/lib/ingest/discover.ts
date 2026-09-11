import type { JobSourceKind } from "@prisma/client";
import { decodeEntities } from "@foothold/shared";
import { politeText, politeFetch, RobotsDisallowed } from "./crawl/fetcher";

export interface DiscoveredSource { kind: JobSourceKind; slug: string; name: string; url: string; evidence: string }

const PATTERNS: Array<{ kind: JobSourceKind; rx: RegExp; slug: (m: RegExpMatchArray) => string; url: (m: RegExpMatchArray) => string }> = [
  { kind: "GREENHOUSE", rx: /(?:boards|job-boards)\.greenhouse\.io\/([\w-]+)/gi, slug: (m) => m[1], url: (m) => `https://boards.greenhouse.io/${m[1]}` },
  { kind: "GREENHOUSE", rx: /boards-api\.greenhouse\.io\/v1\/boards\/([\w-]+)/gi, slug: (m) => m[1], url: (m) => `https://boards.greenhouse.io/${m[1]}` },
  { kind: "LEVER", rx: /jobs\.lever\.co\/([\w-]+)/gi, slug: (m) => m[1], url: (m) => `https://jobs.lever.co/${m[1]}` },
  { kind: "ASHBY", rx: /jobs\.ashbyhq\.com\/([\w.-]+)/gi, slug: (m) => m[1], url: (m) => `https://jobs.ashbyhq.com/${m[1]}` },
  { kind: "WORKDAY", rx: /([\w-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([\w-]+)/g, slug: (m) => `${m[1]}.${m[2]}/${m[3]}`, url: (m) => `https://${m[1]}.${m[2]}.myworkdayjobs.com/${m[3]}` },
  { kind: "SMARTRECRUITERS", rx: /(?:jobs|careers)\.smartrecruiters\.com\/([\w-]+)/gi, slug: (m) => m[1], url: (m) => `https://jobs.smartrecruiters.com/${m[1]}` },
  { kind: "SMARTRECRUITERS", rx: /api\.smartrecruiters\.com\/v1\/companies\/([\w-]+)/gi, slug: (m) => m[1], url: (m) => `https://jobs.smartrecruiters.com/${m[1]}` },
  { kind: "WORKABLE", rx: /apply\.workable\.com\/([\w-]+)/gi, slug: (m) => m[1], url: (m) => `https://apply.workable.com/${m[1]}` },
  { kind: "WORKABLE", rx: /https?:\/\/([\w-]+)\.workable\.com/gi, slug: (m) => m[1], url: (m) => `https://apply.workable.com/${m[1]}` },
];
const CAREERS_LINK = /career|jobs|join[-_ ]?us|work[-_ ]?with|open[-_ ]?positions|hiring|opportunities/i;
const ATS_LINK_HOSTS = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com|jobvite\.com|icims\.com|bamboohr\.com|rippling\.com)$/i;
const SKIP_SLUGS = new Set(["www", "app", "api", "jobs", "careers", "boards", "apply", "static", "embed", "wday", "en-us", "myworkdayjobs", "wd1", "wd2", "wd3", "wd4", "wd5", "wd10", "wd12", "wd103", "wd104", "wd105", "wd108"]);
const MAX_PROBES = 8;

const registrable = (host: string) => host.replace(/^www\./, "").split(".").slice(-2).join(".");
/** Careers-page candidates: anchors on the site itself or on a known ATS host, so marketing links elsewhere are ignored. */
function links(html: string, base: URL): string[] {
  const out = new Set<string>();
  const rx = /<a[^>]+href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    try {
      const u = new URL(decodeEntities(m[1]), base);
      if (!/^https?:$/.test(u.protocol)) continue;
      if (registrable(u.hostname) !== registrable(base.hostname) && !ATS_LINK_HOSTS.test(u.hostname)) continue;
      const text = m[2].replace(/<[^>]+>/g, " ");
      if (CAREERS_LINK.test(u.pathname + " " + text)) out.add(u.href.split("#")[0]);
    } catch { /* ignore */ }
  }
  return [...out].slice(0, 6);
}

/** Public ATS APIs answer 200 for a real board: probe them with slugs derived from the domain, first hit per ATS wins, at most MAX_PROBES requests. */
async function probeAts(slugs: string[], companyName: string): Promise<DiscoveredSource[]> {
  const out: DiscoveredSource[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nameOk = (n: string | undefined) => !n || norm(n).includes(norm(companyName).slice(0, 5)) || norm(companyName).includes(norm(n).slice(0, 5));
  const probes: Array<{ kind: JobSourceKind; url: (s: string) => string; check: (j: unknown) => string | false }> = [
    { kind: "GREENHOUSE", url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}`, check: (j) => (j && typeof j === "object" && "name" in j && nameOk(String((j as { name: string }).name)) ? String((j as { name: string }).name) : false) },
    { kind: "LEVER", url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json&limit=1`, check: (j) => (Array.isArray(j) && j.length > 0 ? "lever" : false) },
    { kind: "ASHBY", url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`, check: (j) => (j && typeof j === "object" && "jobs" in j && Array.isArray((j as { jobs: unknown[] }).jobs) && (j as { jobs: unknown[] }).jobs.length > 0 ? "ashby" : false) },
    { kind: "WORKABLE", url: (s) => `https://www.workable.com/api/accounts/${s}`, check: (j) => (j && typeof j === "object" && "jobs" in j && Array.isArray((j as { jobs: unknown[] }).jobs) && (j as { jobs: unknown[] }).jobs.length > 0 && (j as { name?: string }).name && nameOk((j as { name?: string }).name) ? "workable" : false) },
    { kind: "SMARTRECRUITERS", url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`, check: (j) => (j && typeof j === "object" && "totalFound" in j && Number((j as { totalFound: number }).totalFound) > 0 ? "smartrecruiters" : false) },
  ];
  const hit = new Set<JobSourceKind>();
  let probed = 0;
  for (const slug of slugs) for (const p of probes) {
    if (hit.has(p.kind)) continue;
    if (probed >= MAX_PROBES) return out;
    probed++;
    try {
      const res = await politeFetch(p.url(slug), { skipRobots: true, retries: 0, timeoutMs: 12_000 });
      if (!res.ok) continue;
      const ok = p.check(await res.json().catch(() => null));
      if (ok) { hit.add(p.kind); out.push({ kind: p.kind, slug, name: companyName, url: p.url(slug), evidence: `public ${p.kind.toLowerCase()} API answered for slug "${slug}"` }); }
    } catch { /* not on this ATS */ }
  }
  return out;
}

/** Find where a company hosts its jobs: scans the homepage and careers pages for ATS links, then probes public ATS APIs by slug. No evasion. */
export async function discoverSources(input: string): Promise<{ name: string; found: DiscoveredSource[]; visited: string[]; blocked: string[] }> {
  const home = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  const visited: string[] = []; const blocked: string[] = [];
  const found = new Map<string, DiscoveredSource>();
  let name = home.hostname.replace(/^www\./, "").split(".")[0];
  const scan = (html: string, url: string) => {
    for (const p of PATTERNS) for (const m of html.matchAll(p.rx)) {
      const slug = p.slug(m);
      if (SKIP_SLUGS.has(slug.toLowerCase()) || SKIP_SLUGS.has(slug.toLowerCase().split(/[./]/)[0])) continue;
      const key = `${p.kind}:${slug}`;
      if (!found.has(key)) found.set(key, { kind: p.kind, slug, name: name.charAt(0).toUpperCase() + name.slice(1), url: p.url(m), evidence: url });
    }
  };
  const pages: string[] = [home.href];
  try {
    const html = await politeText(home.href); visited.push(home.href);
    const t = /<title[^>]*>([^<]{1,80})<\/title>/i.exec(html)?.[1]; if (t) name = decodeEntities(t).split(/[|–-]/)[0].trim() || name;
    scan(html, home.href);
    for (const l of links(html, home)) if (!pages.includes(l)) pages.push(l);
  } catch (e) { if (e instanceof RobotsDisallowed) blocked.push(home.href); else throw e; }
  for (const url of pages.slice(1, 5)) {
    try {
      const html = await politeText(url); visited.push(url); scan(html, url);
      if (new URL(url).hostname === home.hostname) for (const l of links(html, new URL(url))) if (!pages.includes(l) && pages.length < 8) pages.push(l);
    } catch (e) { if (e instanceof RobotsDisallowed) blocked.push(url); }
  }
  const ats = [...found.values()];
  if (!ats.length) {
    const base = home.hostname.replace(/^www\./, "").split(".")[0];
    const slugs = [...new Set([base, base.replace(/-/g, ""), name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), name.toLowerCase().replace(/[^a-z0-9]/g, "")].filter(Boolean))];
    ats.push(...(await probeAts(slugs, name)));
  }
  if (!ats.length) {
    const careersPage = pages.slice(1).find((p) => new URL(p).hostname === home.hostname && !blocked.includes(p));
    if (careersPage) ats.push({ kind: "CAREERS", slug: careersPage, name, url: careersPage, evidence: "no known ATS found; generic careers crawl" });
  }
  return { name, found: ats, visited, blocked };
}
