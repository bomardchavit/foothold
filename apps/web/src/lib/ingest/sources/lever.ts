import { stripHtml, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { getJson } from "./index";

interface LeverPosting { id: string; text: string; categories?: { location?: string; team?: string; commitment?: string; department?: string }; descriptionPlain?: string; description?: string; lists?: Array<{ text: string; content: string }>; additionalPlain?: string; hostedUrl: string; applyUrl: string; createdAt: number; workplaceType?: string; salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } }

/** Lever Postings API (public, no key): https://api.lever.co/v0/postings/{site}?mode=json */
export const lever: SourceAdapter = {
  kind: "LEVER", label: "Lever postings", needsKey: false,
  async fetchJobs({ slug, name }) {
    const postings = await getJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
    return postings.map((p): NormalizedJob => {
      const lists = (p.lists ?? []).map((l) => `${l.text}\n${stripHtml(l.content)}`).join("\n\n");
      const description = [p.descriptionPlain ?? stripHtml(p.description ?? ""), lists, p.additionalPlain ?? ""].filter(Boolean).join("\n\n");
      const interval = p.salaryRange?.interval?.toLowerCase();
      return {
        externalId: p.id, title: p.text, company: name || slug, description, location: p.categories?.location ?? null,
        isRemote: p.workplaceType === "remote" || /remote/i.test(p.categories?.location ?? ""), applyUrl: p.applyUrl || p.hostedUrl,
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        salaryMin: p.salaryRange?.min ?? null, salaryMax: p.salaryRange?.max ?? null, salaryCurrency: p.salaryRange?.currency ?? null,
        salaryPeriod: interval === "per-year-salary" || interval === "year" ? "year" : interval === "per-hour-wage" || interval === "hour" ? "hour" : null,
        raw: { team: p.categories?.team, commitment: p.categories?.commitment, workplaceType: p.workplaceType },
      };
    });
  },
};
