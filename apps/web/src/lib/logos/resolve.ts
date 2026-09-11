import { prisma } from "../db";
import { putFile, getFile } from "../storage";
import { politeFetch, RobotsDisallowed } from "../ingest/crawl/fetcher";
import { decodeEntities } from "@foothold/shared";

const ATS_HOSTS = /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com|adzuna|usajobs\.gov|example\.com$/i;
const MAX_BYTES = 1_000_000;

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

async function fetchImage(url: string): Promise<{ bytes: Buffer; type: string } | null> {
  try {
    const res = await politeFetch(url, { retries: 0, timeoutMs: 15_000, headers: { Accept: "image/*,*/*;q=0.5" } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!/^image\//.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > MAX_BYTES) return null;
    return { bytes: buf, type };
  } catch { return null; }
}

/** Candidate icon URLs declared by the site itself (apple-touch-icon first, then icons, then og:image). */
function iconLinks(html: string, base: URL): string[] {
  const out: Array<{ url: string; score: number }> = [];
  for (const m of html.matchAll(/<link[^>]+>/gi)) {
    const tag = m[0];
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/icon/.test(rel)) continue;
    const sizes = /sizes\s*=\s*["'](\d+)x\d+["']/i.exec(tag)?.[1];
    const score = (rel.includes("apple-touch") ? 400 : 100) + (sizes ? Math.min(Number(sizes), 300) : 0) + (/\.svg/i.test(href) ? 50 : 0);
    try { out.push({ url: new URL(decodeEntities(href), base).href, score }); } catch { /* ignore */ }
  }
  const og = /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  if (og) { try { out.push({ url: new URL(decodeEntities(og), base).href, score: 10 }); } catch { /* ignore */ } }
  return out.sort((a, b) => b.score - a.score).map((x) => x.url);
}

/** Fetch and store a company's logo from its own website (robots-compliant). Returns the storage key or null. */
export async function resolveCompanyLogo(companyId: string): Promise<string | null> {
  const domain = await inferCompanyDomain(companyId);
  if (!domain || /(^|\.)example\.(com|org|net)$/i.test(domain)) { await prisma.company.update({ where: { id: companyId }, data: { logoFetchedAt: new Date() } }); return null; }
  const base = new URL(`https://${domain}/`);
  const candidates: string[] = [`${base.origin}/apple-touch-icon.png`, `${base.origin}/apple-touch-icon-precomposed.png`];
  try {
    const res = await politeFetch(base.href, { retries: 1, timeoutMs: 20_000 });
    if (res.ok) candidates.push(...iconLinks(await res.text(), new URL(res.url || base.href)));
  } catch (e) { if (!(e instanceof RobotsDisallowed)) console.warn("[logos] homepage fetch failed", domain, e instanceof Error ? e.message : e); }
  candidates.push(`${base.origin}/favicon.ico`);
  for (const url of [...new Set(candidates)].slice(0, 6)) {
    const img = await fetchImage(url);
    if (!img) continue;
    const ext = img.type.includes("svg") ? "svg" : img.type.includes("png") ? "png" : img.type.includes("jpeg") ? "jpg" : img.type.includes("webp") ? "webp" : "ico";
    const key = `logos/${companyId}.${ext}`;
    await putFile(key, img.bytes);
    await prisma.company.update({ where: { id: companyId }, data: { logoKey: key, logoFetchedAt: new Date(), domain } });
    return key;
  }
  await prisma.company.update({ where: { id: companyId }, data: { logoFetchedAt: new Date(), domain } });
  return null;
}

export async function resolveMissingLogos(limit = 50): Promise<number> {
  const companies = await prisma.company.findMany({ where: { logoFetchedAt: null }, select: { id: true }, take: limit, orderBy: { createdAt: "desc" } });
  let n = 0;
  for (const c of companies) { try { if (await resolveCompanyLogo(c.id)) n++; } catch (e) { console.warn("[logos] failed", c.id, e instanceof Error ? e.message : e); } }
  return n;
}

export const CONTENT_TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp", ico: "image/x-icon" };
export async function readLogo(key: string): Promise<{ bytes: Buffer; type: string } | null> {
  try { const bytes = await getFile(key); return { bytes, type: CONTENT_TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream" }; } catch { return null; }
}
