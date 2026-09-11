import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export const VECTOR_DIM = 1024;

export function toVectorLiteral(v: number[]): string {
  if (v.length !== VECTOR_DIM) throw new Error(`expected ${VECTOR_DIM} dims, got ${v.length}`);
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
}

export async function setJobEmbedding(jobId: string, vec: number[], provider: string) {
  await prisma.$executeRaw`UPDATE "Job" SET "embedding" = ${toVectorLiteral(vec)}::vector, "embeddingProvider" = ${provider} WHERE "id" = ${jobId}`;
}
export async function setProfileEmbedding(profileId: string, vec: number[], provider: string) {
  await prisma.$executeRaw`UPDATE "CandidateProfile" SET "embedding" = ${toVectorLiteral(vec)}::vector, "embeddingProvider" = ${provider} WHERE "id" = ${profileId}`;
}

export async function cosineForJobs(profileId: string, jobIds: string[]): Promise<Map<string, number>> {
  if (!jobIds.length) return new Map();
  const rows = await prisma.$queryRaw<Array<{ id: string; cosine: number | null }>>(Prisma.sql`
    SELECT j."id", CASE WHEN j."embedding" IS NULL OR p."embedding" IS NULL THEN NULL ELSE (1 - (j."embedding" <=> p."embedding"))::float8 END AS cosine
    FROM "Job" j, "CandidateProfile" p
    WHERE p."id" = ${profileId} AND j."id" IN (${Prisma.join(jobIds)})`);
  const m = new Map<string, number>();
  for (const r of rows) if (r.cosine != null) m.set(r.id, r.cosine);
  return m;
}

export async function jobsMissingEmbedding(limit = 200): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Job" WHERE "embedding" IS NULL ORDER BY "createdAt" DESC LIMIT ${limit}`);
  return rows.map((r) => r.id);
}
