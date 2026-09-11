// Background worker: `npm run worker` (requires JOBS_MODE=queue in the web app to route jobs here).
// Headless rendering for careers crawls is allowed here (never inside the web server); SCRAPER_RENDER=0 turns it off.
process.env.SCRAPER_RENDER ??= "1";
import { PgBoss, type Job } from "pg-boss";
import { JOB_HANDLERS, type JobName } from "./lib/jobs/registry";

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  boss.on("error", (e: Error) => console.error("[pg-boss]", e));
  await boss.start();
  for (const name of Object.keys(JOB_HANDLERS) as JobName[]) {
    await boss.createQueue(name).catch(() => {});
    await boss.work<object>(name, { batchSize: 1 }, async (jobs: Job<object>[]) => {
      for (const job of jobs) {
        console.log(`[worker] ${name} ${job.id}`);
        await (JOB_HANDLERS[name] as (d: unknown) => Promise<void>)(job.data);
      }
    });
  }
  // Same cadence as the in-process scheduler: poll what is due every ten minutes, tidy up hourly.
  await boss.schedule("ingest.poll", "*/10 * * * *", {}, { tz: "UTC" });
  await boss.schedule("ingest.housekeeping", "20 * * * *", {}, { tz: "UTC" });
  await boss.schedule("digest.daily", "0 13 * * *", {}, { tz: "UTC" });
  console.log("[worker] listening for jobs:", Object.keys(JOB_HANDLERS).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); });
