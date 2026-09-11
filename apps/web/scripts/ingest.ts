// npm run ingest            → run every enabled source
// npm run ingest -- greenhouse:stripe   → run (and create) one source
import { prisma } from "../src/lib/db";
import { ingestAllJob, ingestSourceJob } from "../src/lib/ingest/run";
import type { JobSourceKind } from "@prisma/client";
async function main() {
  const arg = process.argv[2];
  if (!arg) { await ingestAllJob(); return; }
  const [k, slug] = arg.split(":");
  const kind = k.toUpperCase() as JobSourceKind;
  const src = await prisma.jobSource.upsert({ where: { kind_slug: { kind, slug } }, create: { kind, slug, enabled: true }, update: {} });
  const r = await ingestSourceJob({ sourceId: src.id });
  console.log(r);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
