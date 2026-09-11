import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { IndexEntry, PollResult, SourceAdapter } from "./index";
import { politeJson } from "../crawl/fetcher";
import { isAllowed } from "../crawl/robots";

interface WdList { total: number; jobPostings: Array<{ title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }> }
interface WdDetail { jobPostingInfo?: { title: string; jobDescription?: string; location?: string; additionalLocations?: string[]; postedOn?: string; startDate?: string; timeType?: string; jobReqId?: string; externalUrl?: string; remoteType?: string } }

/**
 * Workday external career sites expose the JSON their own pages use (undocumented). slug = "tenant.wd5/SiteName"
 * (from https://tenant.wd5.myworkdayjobs.com/SiteName). Only used when the site's robots.txt allows /wday/cxs/.
 */
/** "tenant.wd5/SiteName" → the CXS endpoints its own career page calls. */
function endpoints(slug: string) {
  const m = /^([\w-]+)\.(wd\d+)\/([\w-]+)$/.exec(slug.trim());
  if (!m) throw new Error('Workday slug must look like "tenant.wd5/SiteName"');
  const [, tenant, wd, site] = m;
  const base = `https://${tenant}.${wd}.myworkdayjobs.com`;
  return { tenant, site, base, listUrl: `${base}/wday/cxs/${tenant}/${site}/jobs`, detail: (path: string) => `${base}/wday/cxs/${tenant}/${site}${path}` };
}
const page = (listUrl: string, offset: number, limit = 20) =>
  politeJson<WdList>(listUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: "" }) });
/** Newest-first slice we read per poll. Big tenants (CVS has 18k postings) are never read whole. */
const POLL_PAGES = Number(process.env.WORKDAY_POLL_PAGES ?? 5);
/**
 * Requisition id → posting path, remembered from the poll that just listed them. Without it every changed posting
 * would re-page the whole listing to find its own path, which is what makes a Workday tenant slow.
 */
const paths = new Map<string, { at: number; byId: Map<string, string> }>();
const PATHS_TTL_MS = 15 * 60_000;

export const workday: SourceAdapter = {
  kind: "WORKDAY", label: "Workday career site", needsKey: false,

  /**
   * The list endpoint carries the requisition id in `bulletFields`, which is the same id the detail call stores, so a
   * poll can tell new postings from ones already read and open only those. `postedOn` is relative text ("Posted Today")
   * and changes daily, so the stable `externalPath` is the version marker instead.
   */
  async poll({ slug }): Promise<PollResult> {
    const { listUrl, base } = endpoints(slug);
    if (!(await isAllowed(listUrl))) throw new Error(`robots.txt at ${base} disallows ${listUrl}; skipping (no evasion)`);
    const entries: IndexEntry[] = [];
    const byId = new Map<string, string>();
    let total = 0;
    for (let i = 0; i < POLL_PAGES; i++) {
      const p = await page(listUrl, i * 20);
      total = p.total ?? total;
      for (const j of p.jobPostings ?? []) {
        const id = j.bulletFields?.[0] || j.externalPath;
        entries.push({ externalId: id, version: j.externalPath, location: j.locationsText ?? null });
        byId.set(id, j.externalPath);
      }
      if ((p.jobPostings?.length ?? 0) < 20) break;
    }
    paths.set(slug, { at: Date.now(), byId });
    return { kind: "index", entries, etag: null, complete: total > 0 ? entries.length >= total : true };
  },

  async fetchOne({ slug, name, externalId }) {
    const { listUrl, detail } = endpoints(slug);
    const cached = paths.get(slug);
    const path = cached && Date.now() - cached.at < PATHS_TTL_MS ? cached.byId.get(externalId) : undefined;
    if (path) {
      const d = await politeJson<WdDetail>(detail(path));
      return d.jobPostingInfo ? toJob(d, { externalPath: path, bulletFields: [externalId] }, slug, name) : null;
    }
    // No fresh listing in hand (a manual run, or the cache aged out): find the posting in the newest pages.
    for (let i = 0; i < POLL_PAGES; i++) {
      const p = await page(listUrl, i * 20);
      const hit = (p.jobPostings ?? []).find((j) => (j.bulletFields?.[0] || j.externalPath) === externalId);
      if (hit) {
        const d = await politeJson<WdDetail>(detail(hit.externalPath));
        return d.jobPostingInfo ? toJob(d, hit, slug, name) : null;
      }
      if ((p.jobPostings?.length ?? 0) < 20) break;
    }
    return null;
  },

  async fetchJobs({ slug, name }) {
    const { base, listUrl } = endpoints(slug);
    if (!(await isAllowed(listUrl))) throw new Error(`robots.txt at ${base} disallows ${listUrl}; skipping (no evasion)`);
    const { detail } = endpoints(slug);
    const out: NormalizedJob[] = [];
    for (let i = 0; i < POLL_PAGES; i++) {
      const p = await page(listUrl, i * 20);
      for (const j of p.jobPostings ?? []) {
        try {
          const d = await politeJson<WdDetail>(detail(j.externalPath));
          if (d.jobPostingInfo) out.push(toJob(d, j, slug, name));
        } catch (e) { console.warn("[workday] detail failed", j.externalPath, e instanceof Error ? e.message : e); }
      }
      if ((p.jobPostings?.length ?? 0) < 20) break;
    }
    return out;
  },
};

function toJob(d: WdDetail, listed: { externalPath: string; title?: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }, slug: string, name: string | null): NormalizedJob {
  const { tenant, site, base } = endpoints(slug);
  const info = d.jobPostingInfo!;
  const location = [info.location, ...(info.additionalLocations ?? [])].filter(Boolean).join(" · ") || listed.locationsText || null;
  return {
    externalId: info.jobReqId || listed.bulletFields?.[0] || listed.externalPath, title: info.title || listed.title || "", company: name || tenant,
    description: stripHtml(info.jobDescription ?? ""),
    location, isRemote: /remote/i.test(info.remoteType ?? "") || /remote/i.test(location ?? ""), applyUrl: info.externalUrl || `${base}/${site}${listed.externalPath}`,
    postedAt: parsePostedOn(info.postedOn ?? listed.postedOn), employmentType: /part/i.test(info.timeType ?? "") ? "PART_TIME" : /full/i.test(info.timeType ?? "") ? "FULL_TIME" : undefined,
    version: listed.externalPath,
    raw: { timeType: info.timeType, startDate: info.startDate },
  };
}

function parsePostedOn(s: string | undefined): string | null {
  if (!s) return null;
  const m = /posted (\d+)\+? days? ago/i.exec(s);
  if (m) return new Date(Date.now() - Number(m[1]) * 86400_000).toISOString();
  if (/today|yesterday/i.test(s)) return new Date(Date.now() - (/yesterday/i.test(s) ? 86400_000 : 0)).toISOString();
  const d = Date.parse(s);
  return isNaN(d) ? null : new Date(d).toISOString();
}
