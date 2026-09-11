/* Seeds: job sources, the synthetic job dataset, an H-1B sample, and a demo user with a parsed résumé and computed matches. */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { runJobNow } from "../src/lib/queue";
import { loadH1bCsv } from "../src/lib/h1b/load";
import { refreshAllCompanySignals } from "../src/lib/h1b/signal";
import { parseResume } from "../src/lib/llm/tasks/parseResume";
import { applyParsedResume, updatePreferences, completeOnboarding } from "../src/lib/profile/service";
import { putFile } from "../src/lib/storage";

const ROOT = path.resolve(process.cwd(), "../../");

// Curated public Greenhouse/Lever/Ashby boards. Disabled by default; enable in Settings → Data sources or run `npm run ingest -- greenhouse:<slug>`.
const BOARDS: Array<["GREENHOUSE" | "LEVER" | "ASHBY", string, string]> = [
  ["GREENHOUSE", "stripe", "Stripe"], ["GREENHOUSE", "figma", "Figma"], ["GREENHOUSE", "datadog", "Datadog"], ["GREENHOUSE", "cloudflare", "Cloudflare"],
  ["GREENHOUSE", "airbnb", "Airbnb"], ["GREENHOUSE", "doordashusa", "DoorDash"], ["GREENHOUSE", "robinhood", "Robinhood"], ["GREENHOUSE", "brexinc", "Brex"],
  ["GREENHOUSE", "anduril", "Anduril"], ["GREENHOUSE", "scaleai", "Scale AI"], ["GREENHOUSE", "vercel", "Vercel"], ["GREENHOUSE", "discord", "Discord"],
  ["GREENHOUSE", "mongodb", "MongoDB"], ["GREENHOUSE", "duolingo", "Duolingo"], ["GREENHOUSE", "coinbase", "Coinbase"], ["GREENHOUSE", "gitlab", "GitLab"],
  ["LEVER", "plaid", "Plaid"], ["LEVER", "rippling", "Rippling"], ["LEVER", "mistral", "Mistral AI"], ["LEVER", "netlify", "Netlify"],
  ["ASHBY", "notion", "Notion"], ["ASHBY", "linear", "Linear"], ["ASHBY", "ramp", "Ramp"], ["ASHBY", "openai", "OpenAI"], ["ASHBY", "supabase", "Supabase"],
];

async function main() {
  console.log("[seed] job sources");
  for (const [kind, slug, name] of BOARDS) {
    await prisma.jobSource.upsert({ where: { kind_slug: { kind, slug } }, create: { kind, slug, name, enabled: false }, update: { name } });
  }
  const seedSource = await prisma.jobSource.upsert({ where: { kind_slug: { kind: "SEED", slug: "jobs" } }, create: { kind: "SEED", slug: "jobs", name: "Synthetic starter dataset", enabled: true }, update: {} });

  console.log("[seed] H-1B sample (data/seed/h1b_sample.csv)");
  const h1b = await loadH1bCsv(path.join(ROOT, "data/seed/h1b_sample.csv"));
  console.log(`[seed] loaded ${h1b.rows} H-1B rows for FY ${h1b.years.join(", ")}`);

  console.log("[seed] ingesting synthetic jobs (parses, embeds, scores)…");
  await runJobNow("ingest.source", { sourceId: seedSource.id });
  await refreshAllCompanySignals();
  console.log(`[seed] jobs: ${await prisma.job.count()} (${await prisma.job.count({ where: { isLowQuality: true } })} flagged low quality)`);

  console.log("[seed] demo user");
  const email = "demo@foothold.local";
  const user = await prisma.user.upsert({ where: { email }, create: { email, name: "Priya Natarajan", emailVerified: new Date() }, update: {} });
  const resumePath = path.join(ROOT, "data/seed/resumes/priya_natarajan.txt");
  const text = await readFile(resumePath, "utf8");
  const key = `resumes/${user.id}/seed-priya.txt`;
  await putFile(key, Buffer.from(text));
  const { parsed, mode } = await parseResume(text, user.id);
  await prisma.resumeUpload.create({ data: { userId: user.id, fileName: "priya_natarajan.txt", mimeType: "text/plain", storageKey: key, rawText: text, parsedJson: { ...parsed, _mode: mode } as object, status: "DONE" } });
  await applyParsedResume(user.id, parsed);
  await updatePreferences(user.id, {
    targetRoles: ["Software Engineer", "Backend Engineer", "Full-Stack Engineer"], locations: ["San Francisco, CA", "Remote"], remotePref: "ANY", seniority: "MID",
    workAuth: "F1_OPT", needsSponsorship: true, salaryFloor: 150000, industries: ["Fintech", "Software / SaaS"], companySizes: ["SMALL", "MEDIUM", "LARGE"],
  });
  const done = await completeOnboarding(user.id);
  await runJobNow("profile.embed", { profileId: done.id });
  const top = await prisma.matchScore.findMany({ where: { profile: { userId: user.id } }, orderBy: { total: "desc" }, take: 3, include: { job: { include: { company: true } } } });
  console.log("[seed] demo matches:", top.map((m) => `${m.total} ${m.job.title} @ ${m.job.company.name}`).join(" | "));
  console.log("[seed] done. Sign in with the dev login as demo@foothold.local");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
