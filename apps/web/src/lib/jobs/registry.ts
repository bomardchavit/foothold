/** Job names + payloads. Handlers are registered lazily to avoid import cycles. */
export type JobPayloads = {
  "resume.parse": { uploadId: string; userId: string };
  "profile.embed": { profileId: string };
  "match.profile": { profileId: string };
  "match.jobs": { jobIds: string[] };
  "jobs.embed": { jobIds: string[] };
  "jobs.index": { jobIds: string[] };
  "ingest.source": { sourceId: string };
  "ingest.all": Record<string, never>;
  "logos.resolve": { limit?: number; retry?: boolean };
  "digest.daily": Record<string, never>;
  "h1b.refresh": Record<string, never>;
};
export type JobName = keyof JobPayloads;
type Handler<N extends JobName> = (data: JobPayloads[N]) => Promise<void>;

export const JOB_HANDLERS: { [N in JobName]: Handler<N> } = {
  "resume.parse": async (d) => (await import("@/lib/resume/parse-job")).parseResumeJob(d),
  "profile.embed": async (d) => (await import("@/lib/matching/jobs")).embedProfileJob(d),
  "match.profile": async (d) => (await import("@/lib/matching/jobs")).matchProfileJob(d),
  "match.jobs": async (d) => (await import("@/lib/matching/jobs")).matchJobsJob(d),
  "jobs.embed": async (d) => (await import("@/lib/matching/jobs")).embedJobsJob(d),
  "jobs.index": async (d) => { const m = await import("@/lib/matching/jobs"); await m.embedJobsJob(d); await m.matchJobsJob(d); },
  "ingest.source": async (d) => { await (await import("@/lib/ingest/run")).ingestSourceJob(d); },
  "ingest.all": async () => (await import("@/lib/ingest/run")).ingestAllJob(),
  "logos.resolve": async (d) => { await (await import("@/lib/logos/resolve")).resolveMissingLogos(d.limit ?? 50, { retry: d.retry }); },
  "digest.daily": async () => { await (await import("@/lib/digest/send")).dailyDigestJob(); },
  "h1b.refresh": async () => { await (await import("@/lib/h1b/signal")).refreshAllCompanySignals(); },
};
