import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { getJson } from "./index";

interface AshbyJob { id: string; title: string; location?: string; secondaryLocations?: Array<{ location: string }>; department?: string; team?: string; isRemote?: boolean; descriptionHtml?: string; descriptionPlain?: string; publishedAt?: string; employmentType?: string; jobUrl: string; applyUrl?: string; compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string } }

/** Ashby Job Posting API (public, no key): https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true */
export const ashby: SourceAdapter = {
  kind: "ASHBY", label: "Ashby job board", needsKey: false,
  async fetchJobs({ slug, name }) {
    const data = await getJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`);
    return data.jobs.map((j): NormalizedJob => ({
      externalId: j.id, title: j.title, company: name || slug,
      description: [j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? ""), j.compensation?.compensationTierSummary ?? j.compensation?.scrapeableCompensationSalarySummary ?? ""].filter(Boolean).join("\n\n"),
      location: j.location ?? null, isRemote: Boolean(j.isRemote), applyUrl: j.applyUrl || j.jobUrl, postedAt: j.publishedAt ?? null,
      raw: { department: j.department, team: j.team, employmentType: j.employmentType },
    }));
  },
};
