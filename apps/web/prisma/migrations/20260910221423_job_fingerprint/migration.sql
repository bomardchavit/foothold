-- DropIndex
DROP INDEX "CandidateProfile_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "Company_normalizedName_trgm_idx";

-- DropIndex
DROP INDEX "H1bEmployer_normalizedName_trgm_idx";

-- DropIndex
DROP INDEX "Job_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");
