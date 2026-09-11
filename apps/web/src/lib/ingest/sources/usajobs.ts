import { stripHtml, type NormalizedJob } from "@foothold/shared";
import { env } from "../../env";
import type { SourceAdapter } from "./index";
import { getJson } from "./index";

interface UsaJobItem { MatchedObjectId: string; MatchedObjectDescriptor: { PositionID: string; PositionTitle: string; PositionURI: string; ApplyURI?: string[]; PositionLocationDisplay?: string; OrganizationName?: string; DepartmentName?: string; PublicationStartDate?: string; PositionRemuneration?: Array<{ MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }>; QualificationSummary?: string; UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[] | string; Requirements?: string; RemoteIndicator?: boolean } } } }

/** USAJobs Search API (key + User-Agent email required). slug = keyword query. */
export const usajobs: SourceAdapter = {
  kind: "USAJOBS", label: "USAJobs search", needsKey: true,
  async fetchJobs({ slug }) {
    if (!env.usajobs) throw new Error("USAJOBS_API_KEY not set");
    if (/example\.com$/i.test(env.usajobs.userAgent) || !env.usajobs.userAgent.includes("@")) throw new Error("set USAJOBS_USER_AGENT to the email address registered with your USAJobs API key (the API rejects other user agents)");
    const data = await getJson<{ SearchResult: { SearchResultItems: UsaJobItem[] } }>(
      `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(slug)}&ResultsPerPage=50`,
      { "Authorization-Key": env.usajobs.key, "User-Agent": env.usajobs.userAgent, Host: "data.usajobs.gov" },
    );
    return data.SearchResult.SearchResultItems.map((it): NormalizedJob => {
      const d = it.MatchedObjectDescriptor;
      const duties = d.UserArea?.Details?.MajorDuties;
      const description = [d.UserArea?.Details?.JobSummary, Array.isArray(duties) ? duties.join("\n") : duties, d.QualificationSummary ? `Qualifications\n${d.QualificationSummary}` : "", d.UserArea?.Details?.Requirements]
        .filter(Boolean).map((s) => stripHtml(String(s))).join("\n\n");
      const rem = d.PositionRemuneration?.[0];
      const interval = rem?.RateIntervalCode?.toLowerCase();
      return {
        externalId: d.PositionID || it.MatchedObjectId, title: d.PositionTitle, company: d.OrganizationName || d.DepartmentName || "U.S. Government", companyDomain: "usajobs.gov",
        companyIndustry: "Government", description, location: d.PositionLocationDisplay ?? null, isRemote: Boolean(d.UserArea?.Details?.RemoteIndicator),
        applyUrl: d.ApplyURI?.[0] || d.PositionURI, postedAt: d.PublicationStartDate ?? null,
        salaryMin: rem?.MinimumRange ? Math.round(Number(rem.MinimumRange)) : null, salaryMax: rem?.MaximumRange ? Math.round(Number(rem.MaximumRange)) : null, salaryCurrency: "USD",
        salaryPeriod: interval === "pa" || interval === "per year" ? "year" : interval === "ph" || interval === "per hour" ? "hour" : null,
        raw: { department: d.DepartmentName },
      };
    });
  },
};
