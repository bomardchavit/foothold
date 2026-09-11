import { PgBoss } from "pg-boss";
import { after } from "next/server";
import { env } from "./env";
import { JOB_HANDLERS, type JobName, type JobPayloads } from "./jobs/registry";

let boss: PgBoss | null = null;
export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  const b = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  b.on("error", (e: Error) => console.error("[pg-boss]", e));
  await b.start();
  boss = b;
  return b;
}

/**
 * Enqueue a background job. JOBS_MODE=queue → pg-boss (run `npm run worker`).
 * JOBS_MODE=inline (default for local demos) → runs after the response is sent, in-process.
 */
export async function enqueue<N extends JobName>(name: N, data: JobPayloads[N]): Promise<void> {
  if (env.jobsMode === "queue") {
    const b = await getBoss();
    await b.send(name, data as object, { retryLimit: 2, retryDelay: 10, expireInSeconds: 600 });
    return;
  }
  try {
    after(async () => { await runJobNow(name, data); });
  } catch {
    // outside a request scope (scripts): run immediately
    await runJobNow(name, data);
  }
}

export async function runJobNow<N extends JobName>(name: N, data: JobPayloads[N]): Promise<void> {
  const handler = JOB_HANDLERS[name] as (d: JobPayloads[N]) => Promise<void>;
  try { await handler(data); } catch (e) { console.error(`[jobs] ${name} failed`, e); throw e; }
}
