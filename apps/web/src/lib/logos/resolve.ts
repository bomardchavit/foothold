import { prisma } from "../db";
import { putFile, getFile, deleteFile } from "../storage";
import { politeFetch, RobotsDisallowed } from "../ingest/crawl/fetcher";
import { decodeEntities } from "@foothold/shared";
import { sniffImage, logoContentType, type ImageInfo } from "./sniff";
import { generatedMark, GENERATED_SUFFIX } from "./mark";

export const ATS_HOSTS = /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com|adzuna|usajobs\.gov|example\.com$/i;
const MAX_BYTES = 1_000_000;
const MIN_SIDE = 48;
/** Generated marks are retried against the network this often, so a real icon replaces them once it becomes fetchable. */
const RETRY_GENERATED_MS = 7 * 86400_000;

export function isPlaceholderDomain(domain: string | null | undefined): boolean { return !domain || /(^|\.)example\.(com|org|net)$/i.test(domain); }
export function isGeneratedLogo(key: string | null | undefined): boolean { return Boolean(key?.endsWith(GENERATED_SUFFIX)); }

/** Domain for a company from what we already know: explicit domain, else a direct apply URL that is not an ATS host. */
export async function inferCompanyDomain(companyId: string): Promise<string | null> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, include: { jobs: { select: { applyUrl: true }, take: 5 } } });
  if (!c) return null;
  if (c.domain) return c.domain;
  for (const j of c.jobs) {
    try { const h = new URL(j.applyUrl).hostname.replace(/^www\./, ""); if (!ATS_HOSTS.test(h)) return h; } catch { /* ignore */ }
  }
  return null;
}

/** Square-ish and large enough to fill an 80px tile. SVGs without a declared size scale, so they pass. */
function acceptableShape(info: ImageInfo, minSide: number): boolean {
  if (info.width == null || info.height == null) return info.format === "svg";
  const ratio = info.width / info.height;
  return ratio >= 0.8 && ratio <= 1.25 && Math.min(info.width, info.height) >= minSide;
}

/**
 * Fetch one icon candidate. Static image assets declared by the site (or a favicon service) are not crawling, so robots.txt
 * is not consulted here (CDN hosts commonly answer 403 for /robots.txt); the homepage HTML fetch stays robots-enforced.
 */
async function fetchImage(url: string, minSide = MIN_SIDE): Promise<{ bytes: Buffer; info: ImageInfo } | null> {
  try {
    const res = await politeFetch(url, { retries: 0, timeoutMs: 15_000, skipRobots: true, headers: { Accept: "image/*,*/*;q=0.5" } });
    if (res.status !== 200) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 200 || bytes.length > MAX_BYTES) return null;
    const info = sniffImage(bytes);
    if (!info || !acceptableShape(info, minSide)) return null;
    return { bytes, info };
  } catch { return null; }
}

/** Icon URLs declared by the site itself: apple-touch-icon first, then sized icons. og:image is a share banner, never a logo. */
export function iconLinks(html: string, base: URL): string[] {
  const out: Array<{ url: string; score: number }> = [];
  for (const m of html.matchAll(/<link[^>]+>/gi)) {
    const tag = m[0];
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/icon/.test(rel) || /^data:/i.test(href)) continue;
    const sizes = /sizes\s*=\s*["'](\d+)x\d+["']/i.exec(tag)?.[1];
    const score = (rel.includes("apple-touch") ? 400 : 100) + (sizes ? Math.min(Number(sizes), 300) : 0) + (/\.svg/i.test(href) ? 50 : 0);
    try { out.push({ url: new URL(decodeEntities(href), base).href, score }); } catch { /* ignore */ }
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.url);
}

async function store(companyId: string, bytes: Buffer | string, ext: string): Promise<string> {
  const key = `logos/${companyId}.${ext}`;
  await putFile(key, typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes);
  return key;
}

/** Step 1: icons the site declares (robots-compliant homepage fetch), plus the conventional paths. */
async function fromSite(companyId: string, domain: string): Promise<string | null> {
  const base = new URL(`https://${domain}/`);
  const candidates: string[] = [`${base.origin}/apple-touch-icon.png`, `${base.origin}/apple-touch-icon-precomposed.png`];
  try {
    const res = await politeFetch(base.href, { retries: 1, timeoutMs: 20_000 });
    if (res.ok) candidates.push(...iconLinks(await res.text(), new URL(res.url || base.href)));
  } catch (e) { if (!(e instanceof RobotsDisallowed)) console.warn("[logos] homepage fetch failed", domain, e instanceof Error ? e.message : e); }
  candidates.push(`${base.origin}/favicon.ico`);
  for (const url of [...new Set(candidates)].slice(0, 6)) {
    const img = await fetchImage(url);
    if (img) return store(companyId, img.bytes, img.info.ext);
  }
  return null;
}

/** Steps 2–3: public favicon services. DuckDuckGo answers 200 only for known domains; Google 404s for unknown ones. */
async function fromFaviconService(companyId: string, domain: string): Promise<string | null> {
  const ddg = await fetchImage(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);
  if (ddg && ddg.bytes.length > 1000) return store(companyId, ddg.bytes, ddg.info.ext);
  const google = await fetchImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, 32);
  if (google) return store(companyId, google.bytes, google.info.ext);
  return null;
}

/**
 * Guaranteed logo chain: site icons → DuckDuckGo → Google favicon → generated SVG mark. `logoKey` is set in every branch,
 * so it is never null after this returns. Placeholder (*.example.com) and domain-less companies go straight to the mark.
 */
export async function resolveCompanyLogo(companyId: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, domain: true, logoKey: true } });
  if (!c) throw new Error(`company ${companyId} not found`);
  const domain = await inferCompanyDomain(companyId);
  let key: string | null = null;
  if (domain && !isPlaceholderDomain(domain)) {
    key = await fromSite(companyId, domain).catch(() => null);
    if (!key) key = await fromFaviconService(companyId, domain).catch(() => null);
  }
  if (!key) key = await store(companyId, generatedMark(c.name), GENERATED_SUFFIX.slice(1));
  if (c.logoKey && c.logoKey !== key) await deleteFile(c.logoKey).catch(() => undefined);
  await prisma.company.update({ where: { id: companyId }, data: { logoKey: key, logoFetchedAt: new Date(), ...(domain && !c.domain ? { domain } : {}) } });
  return key;
}

/**
 * Companies without a logo, plus (with `retry`) companies still on a generated mark whose domain is real and whose last
 * attempt is older than a week. Returns the number of companies processed; each now has a logoKey.
 */
export async function resolveMissingLogos(limit = 50, opts: { retry?: boolean } = {}): Promise<number> {
  const retryBefore = new Date(Date.now() - RETRY_GENERATED_MS);
  const where = opts.retry
    ? { OR: [{ logoKey: null }, { logoKey: { endsWith: GENERATED_SUFFIX }, logoFetchedAt: { lt: retryBefore }, domain: { not: null } }] }
    : { logoKey: null };
  const rows = await prisma.company.findMany({ where, select: { id: true, logoKey: true, domain: true }, take: limit, orderBy: { createdAt: "desc" } });
  const companies = rows.filter((c) => !c.logoKey || !isPlaceholderDomain(c.domain));
  let n = 0;
  for (const c of companies) {
    try { await resolveCompanyLogo(c.id); n++; } catch (e) { console.warn("[logos] failed", c.id, e instanceof Error ? e.message : e); }
  }
  return n;
}

export async function readLogo(key: string): Promise<{ bytes: Buffer; type: string } | null> {
  try { const bytes = await getFile(key); return { bytes, type: logoContentType(key, bytes) }; } catch { return null; }
}
