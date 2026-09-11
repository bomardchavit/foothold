import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { politeJson } from "../crawl/fetcher";

interface WkJob { title: string; shortcode: string; code?: string; employment_type?: string; telecommuting?: boolean; department?: string; url: string; application_url?: string; city?: string; state?: string; country?: string; created_at?: string; description?: string; requirements?: string; benefits?: string }

/** Workable public widget API (no key): https://www.workable.com/api/accounts/{subdomain}?details=true */
export const workable: SourceAdapter = {
  kind: "WORKABLE", label: "Workable job board", needsKey: false,
  async fetchJobs({ slug, name }) {
    const data = await politeJson<{ name?: string; jobs: WkJob[] }>(`https://www.workable.com/api/accounts/${encodeURIComponent(slug)}?details=true`, { skipRobots: true });
    return (data.jobs ?? []).map((j): NormalizedJob => {
      const et = j.employment_type ?? "";
      return {
        externalId: j.shortcode, title: j.title, company: data.name || name || slug,
        description: [stripHtml(j.description ?? ""), j.requirements ? `Requirements\n${stripHtml(j.requirements)}` : "", j.benefits ? `Benefits\n${stripHtml(j.benefits)}` : ""].filter(Boolean).join("\n\n"),
        location: [j.city, j.state, j.country].filter(Boolean).join(", ") || null, isRemote: Boolean(j.telecommuting), applyUrl: j.application_url || j.url, postedAt: j.created_at ?? null,
        employmentType: /intern/i.test(et) ? "INTERNSHIP" : /contract/i.test(et) ? "CONTRACT" : /part/i.test(et) ? "PART_TIME" : /full/i.test(et) ? "FULL_TIME" : undefined,
        raw: { department: j.department, code: j.code },
      };
    });
  },
};
