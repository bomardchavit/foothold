import { unstable_cache } from "next/cache";
import { prisma } from "../db";

/**
 * Distinct job industries for the Industry filter chip. Prisma's `distinct` (without the nativeDistinct preview)
 * loads every Job row and de-duplicates in JS, so this runs one `SELECT DISTINCT` in Postgres instead and caches
 * the small result for an hour; the list only changes when a scrape introduces a new industry.
 */
export const listIndustries = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.$queryRaw<Array<{ industry: string }>>`SELECT DISTINCT "industry" FROM "Job" WHERE "industry" IS NOT NULL ORDER BY "industry" ASC`;
    return rows.map((r) => r.industry);
  },
  ["job-industries"],
  { revalidate: 3600, tags: ["industries"] },
);
