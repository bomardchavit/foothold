import { createHash } from "node:crypto";
import { stripHtml, decodeEntities, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { politeText, politeFetch, RobotsDisallowed } from "../crawl/fetcher";
import { isAllowed, sitemapsFor } from "../crawl/robots";
import { extractJobPostings } from "../crawl/jsonld";
import { renderPage } from "../crawl/render";

const JOB_LINK = /(?:^|\/)(?:jobs?|careers?|positions?|openings?|vacanc(?:y|ies)|roles?|opportunit(?:y|ies)|job-?openings?|apply)(?:[\/?#-]|$)/i;
const MAX_LINKS = Number(process.env.SCRAPER_MAX_PAGES ?? 150);

function absoluteLinks(html: string, base: URL): string[] {
  const out = new Set<string>();
  const rx = /<a[^>]+href\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    try {
      const u = new URL(decodeEntities(m[1]), base);
      if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) continue;
      u.hash = "";
      if (JOB_LINK.test(u.pathname) && u.href !== base.href) out.add(u.href);
    } catch { /* ignore */ }
  }
  return [...out];
}

async function sitemapJobUrls(origin: string): Promise<string[]> {
  const urls = new Set<string>();
  const maps = [...new Set([...(await sitemapsFor(origin)), `${origin}/sitemap.xml`])];
  const locsOf = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((x) => x[1]);
  const queue = [...maps];
  const seen = new Set<string>();
  let fetched = 0;
  while (queue.length && fetched < 40 && urls.size <= MAX_LINKS) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue; seen.add(sm); fetched++;
    try {
      const locs = locsOf(await politeText(sm, { timeoutMs: 20_000 }));
      const nested = locs.filter((l) => /\.xml(\.gz)?(\?|$)/i.test(l));
      nested.sort((a, b) => Number(/job|career|position|opening/i.test(b)) - Number(/job|career|position|opening/i.test(a)));
      queue.push(...nested.filter((l) => !l.endsWith(".gz")));
      for (const l of locs) { if (/\.xml(\.gz)?(\?|$)/i.test(l)) continue; try { if (JOB_LINK.test(new URL(l).pathname)) urls.add(l); } catch { /* ignore */ } }
    } catch { /* unreadable sitemap */ }
  }
  return [...urls];
}

function looksJsRendered(html: string): boolean {
  const text = stripHtml(html);
  return text.length < 600 || (/__NEXT_DATA__|data-reactroot|ng-version|id="app"|id="root"/.test(html) && text.length < 1500);
}

/** Last-resort extraction for pages without JSON-LD: needs a job-looking title and a real description. */
function fallbackFromHtml(html: string, url: string, company: string): NormalizedJob | null {
  const raw = /<meta[^>]+property\s*=\s*["']og:title["'][^>]+content\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "";
  const title = decodeEntities(raw.replace(/<[^>]+>/g, "")).trim();
  if (!title || title.length > 140 || !/(engineer|developer|manager|analyst|designer|scientist|specialist|lead|director|intern\b|internship|associate|consultant|architect|coordinator|representative|recruiter|marketing|sales|product|operations|accountant|nurse|technician)/i.test(title)) return null;
  if (/\b(careers?|opportunities|open positions|jobs at|working at|life at|our teams?)\b/i.test(title)) return null; // hub pages, not postings
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ?? /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const description = stripHtml(main).slice(0, 20000);
  if (description.length < 500) return null;
  const signals = ["responsibilities", "requirements", "qualifications", "what you'll do", "what you will do", "about the role", "apply", "you will", "we're looking for", "we are looking for"].filter((w) => description.toLowerCase().includes(w)).length;
  if (signals < 2) return null;
  return { externalId: createHash("sha1").update(url).digest("hex"), title, company, description, location: null, applyUrl: url, postedAt: null, raw: { source: "html-fallback", page: url } };
}

/** Generic company careers site: robots-compliant crawl of job pages, structured JobPosting data first. slug = careers page URL. */
export const careers: SourceAdapter = {
  kind: "CAREERS", label: "Careers site (JSON-LD crawl)", needsKey: false,
  async fetchJobs({ slug, name }) {
    const start = new URL(/^https?:\/\//i.test(slug) ? slug : `https://${slug}`);
    if (!(await isAllowed(start))) throw new RobotsDisallowed(start.href);
    const company = name || start.hostname.replace(/^www\./, "").split(".")[0];
    let html = await politeText(start.href);
    if (looksJsRendered(html)) html = (await renderPage(start.href)) ?? html;
    const jobs: NormalizedJob[] = [];
    const seen = new Set<string>();
    const push = (list: NormalizedJob[]) => { for (const j of list) if (!seen.has(j.externalId)) { seen.add(j.externalId); jobs.push(j); } };
    push(extractJobPostings(html, start.href, company));
    const candidates = new Set<string>([...absoluteLinks(html, start), ...(await sitemapJobUrls(start.origin))]);
    // Listing hubs (/jobs, /jobs/search, /careers/openings …) usually hold the real posting links; expand a few of them.
    const HUB = /\/(?:jobs?|careers?|openings?|positions?|search|opportunities|vacancies)\/?(?:search\/?)?$/i;
    const hubs = [...candidates].filter((l) => HUB.test(new URL(l).pathname)).slice(0, 5);
    for (const guess of [`${start.origin}/jobs`, `${start.origin}/jobs/search`, `${start.origin}/careers/jobs`, `${start.origin}/careers/openings`, `${start.origin}/careers/search`]) if (!hubs.includes(guess) && hubs.length < 8) hubs.push(guess);
    for (const hub of hubs) {
      try {
        if (!(await isAllowed(hub))) continue;
        const res = await politeFetch(hub);
        if (!res.ok) continue;
        let page = await res.text();
        if (looksJsRendered(page) || absoluteLinks(page, new URL(hub)).length < 3) page = (await renderPage(hub)) ?? page;
        push(extractJobPostings(page, hub, company));
        for (const l of absoluteLinks(page, new URL(hub))) candidates.add(l);
      } catch { /* skip hub */ }
    }
    const links = [...candidates].filter((l) => !hubs.includes(l) && l !== start.href).slice(0, MAX_LINKS);
    const errors: string[] = [];
    for (const link of links) {
      if (jobs.length >= 500) break;
      try {
        if (!(await isAllowed(link))) continue;
        let page = await politeText(link);
        let found = extractJobPostings(page, link, company);
        if (!found.length && looksJsRendered(page)) { const rendered = await renderPage(link); if (rendered) { page = rendered; found = extractJobPostings(page, link, company); } }
        if (!found.length) { const fb = fallbackFromHtml(page, link, company); if (fb) found = [fb]; }
        push(found);
      } catch (e) { errors.push(`${link}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (errors.length) console.warn(`[careers] ${errors.length} page errors for ${start.host}; first: ${errors[0]}`);
    return jobs;
  },
};
