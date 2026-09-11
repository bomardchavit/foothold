-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "company_name_trgm" ON "Company" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "HiddenJob_jobId_idx" ON "HiddenJob"("jobId");

-- CreateIndex
CREATE INDEX "Job_sourceId_lastSeenAt_idx" ON "Job"("sourceId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "Job_closedAt_idx" ON "Job"("closedAt");

-- CreateIndex
CREATE INDEX "job_title_trgm" ON "Job" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "job_location_trgm" ON "Job" USING GIN ("location" gin_trgm_ops);
