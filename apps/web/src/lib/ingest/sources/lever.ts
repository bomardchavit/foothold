import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { PollResult, SourceAdapter, SourceRef } from "./index";
import { getJson, getJsonIfChanged } from "./index";

interface LeverPosting { id: string; text: string; categories?: { location?: string; team?: string; commitment?: string; department?: string }; descriptionPlain?: string; description?: string; lists?: Array<{ text: string; content: string }>; additionalPlain?: string; hostedUrl: string; applyUrl: string; createdAt: number; workplaceType?: string; salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } }

const api = (slug: string) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;

/** Lever Postings API (public, no key): https://api.lever.co/v0/postings/{site}?mode=json */
export const lever: SourceAdapter = {
  kind: "LEVER", label: "Lever postings", needsKey: false,

  // One document per board with an ETag: unchanged boards cost a single conditional request.
  async poll({ slug, name, etag }: SourceRef & { etag: string | null }): Promise<PollResult> {
    const res = await getJsonIfChanged<LeverPosting[]>(api(slug), etag);
    if (res.notModified) return { kind: "not-modified" };
    return { kind: "full", jobs: res.body.map((p) => toJob(p, name || slug)), etag: res.etag };
  },

  async fetchJobs({ slug, name }) {
    const postings = await getJson<LeverPosting[]>(api(slug));
    return postings.map((p) => toJob(p, name || slug));
  },
};

function toJob(p: LeverPosting, company: string): NormalizedJob {
  const lists = (p.lists ?? []).map((l) => `${l.text}\n${stripHtml(l.content)}`).join("\n\n");
  const description = [p.descriptionPlain ?? stripHtml(p.description ?? ""), lists, p.additionalPlain ?? ""].filter(Boolean).join("\n\n");
  const interval = p.salaryRange?.interval?.toLowerCase();
  return {
    externalId: p.id, title: p.text, company, description, location: p.categories?.location ?? null,
    isRemote: p.workplaceType === "remote" || /remote/i.test(p.categories?.location ?? ""), applyUrl: p.applyUrl || p.hostedUrl,
    postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    salaryMin: p.salaryRange?.min ?? null, salaryMax: p.salaryRange?.max ?? null, salaryCurrency: p.salaryRange?.currency ?? null,
    salaryPeriod: interval === "per-year-salary" || interval === "year" ? "year" : interval === "per-hour-wage" || interval === "hour" ? "hour" : null,
    raw: { team: p.categories?.team, commitment: p.categories?.commitment, workplaceType: p.workplaceType },
  };
}
