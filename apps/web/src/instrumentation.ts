/**
 * In-process scheduler so scraping keeps running whenever the app runs (no separate worker needed).
 *
 * A tick every SCRAPE_INTERVAL_MIN minutes (default 10) polls every source whose turn has come. Boards that support
 * conditional requests answer 304 when nothing changed, so a full sweep of a few hundred employers costs a few hundred
 * small requests and parses only the postings that actually moved. Housekeeping (stale flags, pruning, dedupe, logos)
 * runs hourly, not on every tick.
 *
 * SCRAPE_INTERVAL_MIN=0 disables it; JOBS_MODE=queue hands scheduling to the worker instead.
 * One run at a time: a tick that fires while the previous run is still going is skipped, never overlapped.
 */
const HOUSEKEEPING_MIN = Number(process.env.SCRAPE_HOUSEKEEPING_MIN ?? 60);

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const every = Number(process.env.SCRAPE_INTERVAL_MIN ?? 10);
  if (!every || process.env.JOBS_MODE === "queue" || process.env.DISABLE_SCHEDULER === "true") return;
  const g = globalThis as unknown as { __footholdScheduler?: boolean; __footholdSchedulerRun?: Promise<void> | null; __footholdHousekeptAt?: number };
  if (g.__footholdScheduler) return;
  g.__footholdScheduler = true;

  const run = async () => {
    if (g.__footholdSchedulerRun) { console.log("[scheduler] previous tick still running; skipping"); return; }
    g.__footholdSchedulerRun = (async () => {
      try {
        const { prisma } = await import("./lib/db");
        const enabled = await prisma.jobSource.count({ where: { enabled: true, kind: { notIn: ["SEED", "MANUAL"] } } });
        if (!enabled) return;
        const { pollDueSources, housekeepingJob } = await import("./lib/ingest/run");
        // A tick must finish before the next one starts, so the poll gets 70% of the interval at most.
        const s = await pollDueSources({ budgetMs: Math.round(every * 60_000 * 0.7) });
        if (s.polled) {
          console.log(`[scheduler] polled ${s.polled}/${s.due} due sources in ${Math.round(s.durationMs / 1000)}s: ${s.notModified} unchanged, ${s.inserted} new, ${s.updated} updated, ${s.closed} closed, ${s.failed} failed`);
        }
        const sinceHousekeeping = Date.now() - (g.__footholdHousekeptAt ?? 0);
        if (sinceHousekeeping > HOUSEKEEPING_MIN * 60_000) {
          g.__footholdHousekeptAt = Date.now();
          await housekeepingJob();
        }
      } catch (e) { console.warn("[scheduler] tick failed", e instanceof Error ? e.message : e); }
    })();
    try { await g.__footholdSchedulerRun; } finally { g.__footholdSchedulerRun = null; }
  };

  setTimeout(run, 20_000).unref();
  setInterval(run, every * 60_000).unref();
  console.log(`[scheduler] polling job sources every ${every} min (SCRAPE_INTERVAL_MIN)`);
}
