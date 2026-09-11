import { loadH1bCsv } from "../src/lib/h1b/load";
import { refreshAllCompanySignals } from "../src/lib/h1b/signal";
import { prisma } from "../src/lib/db";
const file = process.argv[2];
if (!file) { console.error("usage: npm run h1b:load -- <path/to/uscis-h1b-employer-hub.csv>"); process.exit(1); }
loadH1bCsv(file).then(async (r) => { console.log(`loaded ${r.rows} rows for FY ${r.years.join(", ")}`); const n = await refreshAllCompanySignals(); console.log(`refreshed ${n} companies`); }).finally(() => prisma.$disconnect());
