import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { politeJson } from "../crawl/fetcher";
import { isAllowed } from "../crawl/robots";

interface WdList { total: number; jobPostings: Array<{ title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }> }
interface WdDetail { jobPostingInfo?: { title: string; jobDescription?: string; location?: string; additionalLocations?: string[]; postedOn?: string; startDate?: string; timeType?: string; jobReqId?: string; externalUrl?: string; remoteType?: string } }

/**
 * Workday external career sites expose the JSON their own pages use (undocumented). slug = "tenant.wd5/SiteName"
 * (from https://tenant.wd5.myworkdayjobs.com/SiteName). Only used when the site's robots.txt allows /wday/cxs/.
 */
export const workday: SourceAdapter = {
  kind: "WORKDAY", label: "Workday career site", needsKey: false,
  async fetchJobs({ slug, name }) {
    const m = /^([\w-]+)\.(wd\d+)\/([\w-]+)$/.exec(slug.trim());
    if (!m) throw new Error('Workday slug must look like "tenant.wd5/SiteName"');
    const [, tenant, wd, site] = m;
    const base = `https://${tenant}.${wd}.myworkdayjobs.com`;
    const listUrl = `${base}/wday/cxs/${tenant}/${site}/jobs`;
    if (!(await isAllowed(listUrl))) throw new Error(`robots.txt at ${base} disallows ${listUrl}; skipping (no evasion)`);
    const out: NormalizedJob[] = [];
    for (let offset = 0; offset < 200; offset += 20) {
      const page = await politeJson<WdList>(listUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }) });
      for (const p of page.jobPostings ?? []) {
        try {
          const d = await politeJson<WdDetail>(`${base}/wday/cxs/${tenant}/${site}${p.externalPath}`);
          const info = d.jobPostingInfo;
          if (!info) continue;
          const location = [info.location, ...(info.additionalLocations ?? [])].filter(Boolean).join(" · ") || p.locationsText || null;
          out.push({
            externalId: info.jobReqId || p.externalPath, title: info.title || p.title, company: name || tenant, description: stripHtml(info.jobDescription ?? ""),
            location, isRemote: /remote/i.test(info.remoteType ?? "") || /remote/i.test(location ?? ""), applyUrl: info.externalUrl || `${base}/${site}${p.externalPath}`,
            postedAt: parsePostedOn(info.postedOn ?? p.postedOn), employmentType: /part/i.test(info.timeType ?? "") ? "PART_TIME" : /full/i.test(info.timeType ?? "") ? "FULL_TIME" : undefined,
            raw: { timeType: info.timeType, startDate: info.startDate },
          });
        } catch (e) { console.warn("[workday] detail failed", p.externalPath, e instanceof Error ? e.message : e); }
      }
      if ((page.jobPostings?.length ?? 0) < 20) break;
    }
    return out;
  },
};

function parsePostedOn(s: string | undefined): string | null {
  if (!s) return null;
  const m = /posted (\d+)\+? days? ago/i.exec(s);
  if (m) return new Date(Date.now() - Number(m[1]) * 86400_000).toISOString();
  if (/today|yesterday/i.test(s)) return new Date(Date.now() - (/yesterday/i.test(s) ? 86400_000 : 0)).toISOString();
  const d = Date.parse(s);
  return isNaN(d) ? null : new Date(d).toISOString();
}
