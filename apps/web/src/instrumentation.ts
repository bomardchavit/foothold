/**
 * In-process scheduler so scraping keeps running whenever the app runs (no separate worker needed).
 * SCRAPE_INTERVAL_MIN=0 disables it; JOBS_MODE=queue hands scheduling to the worker instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const every = Number(process.env.SCRAPE_INTERVAL_MIN ?? 120);
  if (!every || process.env.JOBS_MODE === "queue" || process.env.DISABLE_SCHEDULER === "true") return;
  const g = globalThis as unknown as { __footholdScheduler?: boolean };
  if (g.__footholdScheduler) return;
  g.__footholdScheduler = true;
  const run = async () => {
    try {
      const { prisma } = await import("./lib/db");
      const enabled = await prisma.jobSource.count({ where: { enabled: true, kind: { notIn: ["SEED", "MANUAL"] } } });
      if (!enabled) return;
      const { ingestAllJob } = await import("./lib/ingest/run");
      console.log(`[scheduler] ingesting ${enabled} enabled sources`);
      await ingestAllJob();
    } catch (e) { console.warn("[scheduler] ingest failed", e instanceof Error ? e.message : e); }
  };
  setTimeout(run, 45_000).unref();
  setInterval(run, every * 60_000).unref();
  console.log(`[scheduler] scraping every ${every} min (SCRAPE_INTERVAL_MIN)`);
}
