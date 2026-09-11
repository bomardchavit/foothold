import type { JobSourceKind } from "@prisma/client";
import type { NormalizedJob } from "@foothold/shared";
import { politeFetch } from "../crawl/fetcher";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { ashby } from "./ashby";
import { adzuna } from "./adzuna";
import { usajobs } from "./usajobs";
import { seed } from "./seed";
import { careers } from "./careers";
import { smartrecruiters } from "./smartrecruiters";
import { workable } from "./workable";
import { workday } from "./workday";

export interface SourceRef { slug: string; name: string | null }

/** One posting as it appears in a board's cheap index: enough to tell new/changed from unchanged. */
export interface IndexEntry { externalId: string; version: string }

/**
 * What a poll found. `not-modified` means the board answered 304 and nothing was parsed; `index` means we know which
 * postings changed and can fetch only those; `full` means the adapter returned everything (the old behaviour).
 */
export type PollResult =
  | { kind: "not-modified" }
  | { kind: "index"; entries: IndexEntry[]; etag: string | null }
  | { kind: "full"; jobs: NormalizedJob[]; etag: string | null };

export interface SourceAdapter {
  kind: JobSourceKind;
  label: string;
  needsKey: boolean;
  fetchJobs(source: SourceRef): Promise<NormalizedJob[]>;
  /** Cheap freshness check. Adapters that implement it let the scheduler poll every few minutes for almost nothing. */
  poll?(source: SourceRef & { etag: string | null }): Promise<PollResult>;
  /** Fetch a single posting by its board id, so an index poll only parses what actually changed. */
  fetchOne?(source: SourceRef & { externalId: string }): Promise<NormalizedJob | null>;
}

const manual: SourceAdapter = { kind: "MANUAL", label: "Added by hand / extension", needsKey: false, async fetchJobs() { return []; } };
export const ADAPTERS: Record<JobSourceKind, SourceAdapter> = { GREENHOUSE: greenhouse, LEVER: lever, ASHBY: ashby, ADZUNA: adzuna, USAJOBS: usajobs, SEED: seed, MANUAL: manual, CAREERS: careers, SMARTRECRUITERS: smartrecruiters, WORKABLE: workable, WORKDAY: workday };

export const USER_AGENT = "Foothold/0.1 (job-search assistant; public-API client)";
/**
 * Documented public job APIs (Greenhouse, Lever, Ashby, Adzuna, USAJobs): fetched through the polite client so 429/503
 * honour Retry-After and transient 5xx/network errors retry with backoff instead of failing the whole run. robots.txt is
 * not consulted for these documented endpoints; the Foothold UA identifies us.
 */
export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await politeFetch(url, { skipRobots: true, retries: 3, timeoutMs: 15_000, headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

/**
 * Conditional GET: sends If-None-Match and reports a 304 instead of throwing. This is what makes a ten-minute poll
 * cheap — an unchanged board costs one small request and no parsing.
 */
export async function getJsonIfChanged<T>(url: string, etag: string | null, headers: Record<string, string> = {}): Promise<{ notModified: true } | { notModified: false; body: T; etag: string | null }> {
  const res = await politeFetch(url, {
    skipRobots: true, retries: 3, timeoutMs: 30_000,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(etag ? { "If-None-Match": etag } : {}), ...headers },
  });
  if (res.status === 304) return { notModified: true };
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return { notModified: false, body: (await res.json()) as T, etag: res.headers.get("etag") };
}
