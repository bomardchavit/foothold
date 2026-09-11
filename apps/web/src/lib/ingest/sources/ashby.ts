import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { PollResult, SourceAdapter, SourceRef } from "./index";
import { getJson, getJsonIfChanged } from "./index";

interface AshbyJob { id: string; title: string; location?: string; secondaryLocations?: Array<{ location: string }>; department?: string; team?: string; isRemote?: boolean; descriptionHtml?: string; descriptionPlain?: string; publishedAt?: string; employmentType?: string; jobUrl: string; applyUrl?: string; compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string } }

const api = (slug: string) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;

/** Ashby Job Posting API (public, no key): https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true */
export const ashby: SourceAdapter = {
  kind: "ASHBY", label: "Ashby job board", needsKey: false,

  // Ashby serves the whole board in one document with an ETag and has no per-posting endpoint, so a poll is either
  // "nothing changed" (one small request) or the same full parse the adapter always did.
  async poll({ slug, name, etag }: SourceRef & { etag: string | null }): Promise<PollResult> {
    const res = await getJsonIfChanged<{ jobs: AshbyJob[] }>(api(slug), etag);
    if (res.notModified) return { kind: "not-modified" };
    return { kind: "full", jobs: res.body.jobs.map((j) => toJob(j, name || slug)), etag: res.etag };
  },

  async fetchJobs({ slug, name }) {
    const data = await getJson<{ jobs: AshbyJob[] }>(api(slug));
    return data.jobs.map((j) => toJob(j, name || slug));
  },
};

function toJob(j: AshbyJob, company: string): NormalizedJob {
  return ({
    externalId: j.id, title: j.title, company,
    description: [j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? ""), j.compensation?.compensationTierSummary ?? j.compensation?.scrapeableCompensationSalarySummary ?? ""].filter(Boolean).join("\n\n"),
    location: j.location ?? null, isRemote: Boolean(j.isRemote), applyUrl: j.applyUrl || j.jobUrl, postedAt: j.publishedAt ?? null,
    raw: { department: j.department, team: j.team, employmentType: j.employmentType },
  });
}
