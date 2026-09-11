import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { IndexEntry, PollResult, SourceAdapter, SourceRef } from "./index";
import { politeJson } from "../crawl/fetcher";

interface SrPosting { id: string; name: string; releasedDate?: string; ref: string; location?: { city?: string; region?: string; country?: string; remote?: boolean }; typeOfEmployment?: { label?: string }; experienceLevel?: { label?: string }; company?: { name?: string; identifier?: string }; industry?: { label?: string }; department?: { label?: string } }
interface SrDetail { applyUrl?: string; jobAd?: { sections?: Record<string, { title?: string; text?: string }> } }

/** SmartRecruiters public Posting API (no key): https://api.smartrecruiters.com/v1/companies/{identifier}/postings */
const listUrl = (slug: string, offset = 0) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100&offset=${offset}`;
const detailUrl = (slug: string, id: string) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings/${encodeURIComponent(id)}`;

async function toJob(p: SrPosting, slug: string, name: string | null): Promise<NormalizedJob> {
  const d = await politeJson<SrDetail>(p.ref || detailUrl(slug, p.id), { skipRobots: true }).catch(() => ({}) as SrDetail);
  const description = Object.values(d.jobAd?.sections ?? {}).map((s) => `${s.title ? s.title + "\n" : ""}${stripHtml(s.text ?? "")}`).join("\n\n");
  const et = p.typeOfEmployment?.label ?? "";
  return {
    externalId: p.id, title: p.name, company: p.company?.name || name || slug, companyIndustry: p.industry?.label ?? null, description: description || `${p.name} at ${p.company?.name ?? slug}`,
    location: [p.location?.city, p.location?.region, p.location?.country].filter(Boolean).join(", ") || null, isRemote: Boolean(p.location?.remote),
    applyUrl: d.applyUrl || `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${p.id}`, postedAt: p.releasedDate ?? null,
    employmentType: /intern/i.test(et) ? "INTERNSHIP" : /contract/i.test(et) ? "CONTRACT" : /part/i.test(et) ? "PART_TIME" : undefined,
    version: p.releasedDate ?? null,
    raw: { experienceLevel: p.experienceLevel?.label, department: p.department?.label },
  };
}

export const smartrecruiters: SourceAdapter = {
  kind: "SMARTRECRUITERS", label: "SmartRecruiters postings", needsKey: false,

  // The posting list is one request per 100; the description is a request per posting. Polling the list tells the
  // runner which postings to open, so an unchanged board costs one or two requests instead of hundreds.
  async poll({ slug }: SourceRef & { etag: string | null }): Promise<PollResult> {
    const entries: IndexEntry[] = [];
    let offset = 0; let total = Infinity;
    while (offset < Math.min(total, 300)) {
      const page = await politeJson<{ totalFound: number; content: SrPosting[] }>(listUrl(slug, offset), { skipRobots: true });
      total = page.totalFound ?? page.content.length;
      for (const p of page.content) entries.push({ externalId: p.id, version: p.releasedDate ?? "", location: [p.location?.city, p.location?.region, p.location?.country].filter(Boolean).join(", ") || null });
      if (!page.content.length) break;
      offset += page.content.length;
    }
    return { kind: "index", entries, etag: null };
  },

  async fetchOne({ slug, name, externalId }) {
    const p = await politeJson<SrPosting>(detailUrl(slug, externalId), { skipRobots: true }).catch(() => null);
    if (!p?.id) return null;
    return toJob({ ...p, ref: p.ref || detailUrl(slug, externalId) }, slug, name);
  },

  async fetchJobs({ slug, name }) {
    const out: NormalizedJob[] = [];
    let offset = 0; let total = Infinity;
    while (offset < Math.min(total, 300)) {
      const page = await politeJson<{ totalFound: number; content: SrPosting[] }>(listUrl(slug, offset), { skipRobots: true });
      total = page.totalFound ?? page.content.length;
      for (const p of page.content) {
        try { out.push(await toJob(p, slug, name)); }
        catch (e) { console.warn("[smartrecruiters] detail failed", p.id, e instanceof Error ? e.message : e); }
      }
      if (!page.content.length) break;
      offset += page.content.length;
    }
    return out;
  },
};
