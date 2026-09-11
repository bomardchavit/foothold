import type { JobSourceKind } from "@prisma/client";
import type { NormalizedJob } from "@foothold/shared";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { ashby } from "./ashby";
import { adzuna } from "./adzuna";
import { usajobs } from "./usajobs";
import { seed } from "./seed";

export interface SourceRef { slug: string; name: string | null }
export interface SourceAdapter { kind: JobSourceKind; label: string; needsKey: boolean; fetchJobs(source: SourceRef): Promise<NormalizedJob[]> }

const manual: SourceAdapter = { kind: "MANUAL", label: "Added by hand / extension", needsKey: false, async fetchJobs() { return []; } };
export const ADAPTERS: Record<JobSourceKind, SourceAdapter> = { GREENHOUSE: greenhouse, LEVER: lever, ASHBY: ashby, ADZUNA: adzuna, USAJOBS: usajobs, SEED: seed, MANUAL: manual };

export const USER_AGENT = "Foothold/0.1 (job-search assistant; public-API client)";
export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}
