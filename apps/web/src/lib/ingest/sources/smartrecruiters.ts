import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { politeJson } from "../crawl/fetcher";

interface SrPosting { id: string; name: string; releasedDate?: string; ref: string; location?: { city?: string; region?: string; country?: string; remote?: boolean }; typeOfEmployment?: { label?: string }; experienceLevel?: { label?: string }; company?: { name?: string; identifier?: string }; industry?: { label?: string }; department?: { label?: string } }
interface SrDetail { applyUrl?: string; jobAd?: { sections?: Record<string, { title?: string; text?: string }> } }

/** SmartRecruiters public Posting API (no key): https://api.smartrecruiters.com/v1/companies/{identifier}/postings */
export const smartrecruiters: SourceAdapter = {
  kind: "SMARTRECRUITERS", label: "SmartRecruiters postings", needsKey: false,
  async fetchJobs({ slug, name }) {
    const out: NormalizedJob[] = [];
    let offset = 0; let total = Infinity;
    while (offset < Math.min(total, 300)) {
      const page = await politeJson<{ totalFound: number; content: SrPosting[] }>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100&offset=${offset}`, { skipRobots: true });
      total = page.totalFound ?? page.content.length;
      for (const p of page.content) {
        try {
          const d = await politeJson<SrDetail>(p.ref, { skipRobots: true });
          const description = Object.values(d.jobAd?.sections ?? {}).map((s) => `${s.title ? s.title + "\n" : ""}${stripHtml(s.text ?? "")}`).join("\n\n");
          const et = p.typeOfEmployment?.label ?? "";
          out.push({
            externalId: p.id, title: p.name, company: p.company?.name || name || slug, companyIndustry: p.industry?.label ?? null, description: description || `${p.name} at ${p.company?.name ?? slug}`,
            location: [p.location?.city, p.location?.region, p.location?.country].filter(Boolean).join(", ") || null, isRemote: Boolean(p.location?.remote),
            applyUrl: d.applyUrl || `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${p.id}`, postedAt: p.releasedDate ?? null,
            employmentType: /intern/i.test(et) ? "INTERNSHIP" : /contract/i.test(et) ? "CONTRACT" : /part/i.test(et) ? "PART_TIME" : undefined,
            raw: { experienceLevel: p.experienceLevel?.label, department: p.department?.label },
          });
        } catch (e) { console.warn("[smartrecruiters] detail failed", p.id, e instanceof Error ? e.message : e); }
      }
      if (!page.content.length) break;
      offset += page.content.length;
    }
    return out;
  },
};
