import { stripHtml, decodeEntities, type NormalizedJob } from "@foothold/shared";
import type { IndexEntry, PollResult, SourceAdapter, SourceRef } from "./index";
import { politeJson } from "../crawl/fetcher";

interface BhListJob { id: string | number; jobOpeningName: string; departmentLabel?: string; employmentStatusLabel?: string; isRemote?: boolean | null; locationType?: string; location?: { city?: string | null; state?: string | null; addressCountry?: string | null } }
interface BhDetail { result?: { jobOpening?: BhListJob & { description?: string; datePosted?: string; compensation?: string | null; jobOpeningShareUrl?: string; minimumExperience?: string | null } } }

const listUrl = (slug: string) => `https://${encodeURIComponent(slug)}.bamboohr.com/careers/list`;
const detailUrl = (slug: string, id: string) => `https://${encodeURIComponent(slug)}.bamboohr.com/careers/${encodeURIComponent(id)}/detail`;
const place = (j: BhListJob) => [j.location?.city, j.location?.state, j.location?.addressCountry].filter(Boolean).join(", ") || null;
/** The list carries no timestamp, so a rename or a move is what marks a posting as changed. */
const versionOf = (j: BhListJob) => `${j.jobOpeningName}|${place(j) ?? ""}|${j.employmentStatusLabel ?? ""}`;

/**
 * BambooHR careers board (public, no key): https://{subdomain}.bamboohr.com/careers/list plus one detail call per
 * posting. Thousands of mid-size US employers run on it, and none of them appear on the ATS boards we already read.
 */
export const bamboohr: SourceAdapter = {
  kind: "BAMBOOHR", label: "BambooHR careers", needsKey: false,

  async poll({ slug }: SourceRef & { etag: string | null }): Promise<PollResult> {
    const data = await politeJson<{ result?: BhListJob[] }>(listUrl(slug), { skipRobots: true });
    const entries: IndexEntry[] = (data.result ?? []).map((j) => ({ externalId: String(j.id), version: versionOf(j) }));
    return { kind: "index", entries, etag: null };
  },

  async fetchOne({ slug, name, externalId }) {
    const d = await politeJson<BhDetail>(detailUrl(slug, externalId), { skipRobots: true }).catch(() => null);
    const j = d?.result?.jobOpening;
    return j ? toJob(j, slug, name, externalId) : null;
  },

  async fetchJobs({ slug, name }) {
    const data = await politeJson<{ result?: BhListJob[] }>(listUrl(slug), { skipRobots: true });
    const out: NormalizedJob[] = [];
    for (const j of data.result ?? []) {
      const d = await politeJson<BhDetail>(detailUrl(slug, String(j.id)), { skipRobots: true }).catch(() => null);
      out.push(toJob({ ...j, ...(d?.result?.jobOpening ?? {}) }, slug, name, String(j.id)));
    }
    return out;
  },
};

function toJob(j: BhListJob & { description?: string; datePosted?: string; compensation?: string | null; jobOpeningShareUrl?: string }, slug: string, name: string | null, id: string): NormalizedJob {
  const status = j.employmentStatusLabel ?? "";
  const description = [stripHtml(decodeEntities(j.description ?? "")), j.compensation ? `Compensation\n${j.compensation}` : ""].filter(Boolean).join("\n\n");
  return {
    externalId: id, title: j.jobOpeningName, company: name || slug,
    description: description || j.jobOpeningName,
    location: place(j), isRemote: Boolean(j.isRemote) || j.locationType === "1",
    applyUrl: j.jobOpeningShareUrl || `https://${slug}.bamboohr.com/careers/${id}`,
    postedAt: j.datePosted ?? null, version: versionOf(j),
    employmentType: /intern/i.test(status) ? "INTERNSHIP" : /contract|temp/i.test(status) ? "CONTRACT" : /part/i.test(status) ? "PART_TIME" : /full/i.test(status) ? "FULL_TIME" : undefined,
    raw: { department: j.departmentLabel, employmentStatus: j.employmentStatusLabel },
  };
}
