import { decodeEntities, stripHtml, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { getJson } from "./index";

interface GhJob { id: number; title: string; updated_at: string; first_published?: string; absolute_url: string; location: { name: string }; content: string; departments?: Array<{ name: string }>; offices?: Array<{ name: string }>; metadata?: unknown }
interface GhBoard { name: string; content?: string }

/** Greenhouse Job Board API (public, no key): https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true */
export const greenhouse: SourceAdapter = {
  kind: "GREENHOUSE", label: "Greenhouse board", needsKey: false,
  async fetchJobs({ slug, name }) {
    const board = await getJson<GhBoard>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`).catch(() => null);
    const data = await getJson<{ jobs: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
    const company = board?.name || name || slug;
    return data.jobs.map((j): NormalizedJob => {
      const locName = j.location?.name?.trim() ?? "";
      const offices = (j.offices ?? []).map((o) => o.name).filter(Boolean);
      // Greenhouse often puts the workplace word in `location` ("Hybrid") and the real cities in `offices`.
      const location = /^(hybrid|remote|on-?site|flexible)$/i.test(locName) || !locName ? (offices.length ? `${offices.join(" · ")}${locName ? ` (${locName})` : ""}` : locName || null) : locName;
      return {
      externalId: String(j.id), title: j.title, company, description: stripHtml(decodeEntities(j.content ?? "")),
      location, isRemote: /remote/i.test(locName) || /remote/i.test(offices.join(" ")), workplaceType: /hybrid/i.test(locName) ? "HYBRID" : /remote/i.test(locName) ? "REMOTE" : undefined, applyUrl: j.absolute_url,
      postedAt: j.updated_at ?? j.first_published ?? null, raw: { departments: j.departments, offices: j.offices, first_published: j.first_published },
      };
    });
  },
};
