import { stripHtml, type NormalizedJob } from "@foothold/shared";
import { env } from "../../env";
import type { SourceAdapter } from "./index";
import { getJson } from "./index";

interface AdzunaResult { id: string; title: string; description: string; redirect_url: string; created: string; company?: { display_name?: string }; location?: { display_name?: string }; salary_min?: number; salary_max?: number; category?: { label?: string } }

/** Adzuna Jobs API (key required; results must carry Adzuna attribution in the UI). slug = search query, e.g. "software engineer". */
export const adzuna: SourceAdapter = {
  kind: "ADZUNA", label: "Adzuna search", needsKey: true,
  async fetchJobs({ slug }) {
    if (!env.adzuna) throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set");
    const out: NormalizedJob[] = [];
    for (let page = 1; page <= 2; page++) {
      const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?app_id=${env.adzuna.id}&app_key=${env.adzuna.key}&results_per_page=50&what=${encodeURIComponent(slug)}&max_days_old=30&content-type=application/json`;
      const data = await getJson<{ results: AdzunaResult[] }>(url);
      for (const r of data.results) {
        out.push({
          externalId: r.id, title: r.title.replace(/<[^>]+>/g, ""), company: r.company?.display_name || "Unknown employer", description: stripHtml(r.description),
          location: r.location?.display_name ?? null, applyUrl: r.redirect_url, postedAt: r.created ?? null,
          salaryMin: r.salary_min ? Math.round(r.salary_min) : null, salaryMax: r.salary_max ? Math.round(r.salary_max) : null, salaryCurrency: "USD", salaryPeriod: "year",
          companyIndustry: r.category?.label ?? null, raw: { category: r.category?.label },
        });
      }
      if (data.results.length < 50) break;
    }
    return out;
  },
};
