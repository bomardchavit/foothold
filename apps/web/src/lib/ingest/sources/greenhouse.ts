import { decodeEntities, stripHtml, type NormalizedJob } from "@foothold/shared";
import type { SourceAdapter } from "./index";
import { getJson } from "./index";

interface GhJob { id: number; title: string; updated_at: string; first_published?: string; absolute_url: string; location: { name: string }; content: string; departments?: Array<{ name: string }>; offices?: Array<{ name: string }>; metadata?: unknown }
interface GhBoard { name: string; content?: string }

const BARE_WORKPLACE = /^(hybrid|remote|on-?site|flexible)$/i;

/** Greenhouse Job Board API (public, no key): https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true */
export const greenhouse: SourceAdapter = {
  kind: "GREENHOUSE", label: "Greenhouse board", needsKey: false,
  async fetchJobs({ slug, name }) {
    const board = await getJson<GhBoard>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`).catch(() => null);
    const data = await getJson<{ jobs: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
    const company = board?.name || name || slug;
    return data.jobs.map((j): NormalizedJob => {
      const locName = j.location?.name?.trim() ?? "";
      const offices = (j.offices ?? []).map((o) => o.name?.trim()).filter(Boolean);
      // Greenhouse often puts the workplace word in `location` ("Hybrid") and the real cities in `offices`. An office list
      // that mixes "Remote" with cities is emitted as "City; Remote" with no workplace verdict, so the location parser decides.
      const bare = BARE_WORKPLACE.test(locName);
      const location = bare || !locName ? (offices.length ? `${offices.join("; ")}${bare ? ` (${locName})` : ""}` : locName || null) : locName;
      const workplaceType = /\bhybrid\b/i.test(locName) ? "HYBRID" : /\bremote\b/i.test(locName) ? "REMOTE" : undefined;
      return {
        externalId: String(j.id), title: j.title, company, description: stripHtml(decodeEntities(j.content ?? "")),
        location, isRemote: workplaceType === "REMOTE" ? true : undefined, workplaceType, applyUrl: j.absolute_url,
        // first_published is when the req went live; updated_at moves on every board re-save and made old reqs look new.
        postedAt: j.first_published ?? j.updated_at ?? null, raw: { departments: j.departments, offices: j.offices, first_published: j.first_published, updated_at: j.updated_at },
      };
    });
  },
};
