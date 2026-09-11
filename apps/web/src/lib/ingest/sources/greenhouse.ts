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
    return data.jobs.map((j): NormalizedJob => ({
      externalId: String(j.id), title: j.title, company, description: stripHtml(decodeEntities(j.content ?? "")),
      location: j.location?.name ?? null, isRemote: /remote/i.test(j.location?.name ?? ""), applyUrl: j.absolute_url,
      postedAt: j.first_published ?? j.updated_at ?? null, raw: { departments: j.departments, offices: j.offices, updated_at: j.updated_at },
    }));
  },
};
