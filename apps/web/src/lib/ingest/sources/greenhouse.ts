import { decodeEntities, stripHtml, type NormalizedJob } from "@foothold/shared";
import type { IndexEntry, PollResult, SourceAdapter, SourceRef } from "./index";
import { getJson, getJsonIfChanged } from "./index";

interface GhJob { id: number; title: string; updated_at: string; first_published?: string; absolute_url: string; location: { name: string }; content: string; departments?: Array<{ name: string }>; offices?: Array<{ name: string }>; metadata?: unknown }
interface GhBoard { name: string; content?: string }

const BARE_WORKPLACE = /^(hybrid|remote|on-?site|flexible)$/i;
const api = (slug: string, path = "") => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}${path}`;

/** Board name, cached per process: it is the company name and it changes about never. */
const boardNames = new Map<string, string | null>();
async function companyName(slug: string, fallback: string | null): Promise<string> {
  if (!boardNames.has(slug)) boardNames.set(slug, await getJson<GhBoard>(api(slug)).then((b) => b.name ?? null).catch(() => null));
  return boardNames.get(slug) || fallback || slug;
}

function toJob(j: GhJob, company: string): NormalizedJob {
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
    postedAt: j.first_published ?? j.updated_at ?? null, version: j.updated_at ?? null,
    raw: { departments: j.departments, offices: j.offices, first_published: j.first_published, updated_at: j.updated_at },
  };
}

/**
 * Greenhouse Job Board API (public, no key): https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
 *
 * The index (no `content=true`) is roughly a twelfth of the size and carries `updated_at` per posting, so a poll can
 * answer "what changed?" cheaply and fetch only those postings one by one. An unchanged board answers 304.
 */
export const greenhouse: SourceAdapter = {
  kind: "GREENHOUSE", label: "Greenhouse board", needsKey: false,

  async fetchJobs({ slug, name }: SourceRef) {
    const company = await companyName(slug, name);
    const data = await getJson<{ jobs: GhJob[] }>(api(slug, "/jobs?content=true"));
    return data.jobs.map((j) => toJob(j, company));
  },

  async poll({ slug, etag }): Promise<PollResult> {
    const res = await getJsonIfChanged<{ jobs: Array<Pick<GhJob, "id" | "updated_at">> }>(api(slug, "/jobs"), etag);
    if (res.notModified) return { kind: "not-modified" };
    const entries: IndexEntry[] = res.body.jobs.map((j) => ({ externalId: String(j.id), version: j.updated_at ?? "" }));
    return { kind: "index", entries, etag: res.etag };
  },

  async fetchOne({ slug, name, externalId }) {
    const company = await companyName(slug, name);
    const j = await getJson<GhJob>(api(slug, `/jobs/${encodeURIComponent(externalId)}`)).catch(() => null);
    return j && j.id ? toJob(j, company) : null;
  },
};
