-- AlterTable
ALTER TABLE "IngestionRun" ADD COLUMN     "notModified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "sourceVersion" TEXT;

-- AlterTable
ALTER TABLE "JobSource" ADD COLUMN     "etag" TEXT,
ADD COLUMN     "failureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "intervalMin" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "nextRunAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "JobSource_enabled_nextRunAt_idx" ON "JobSource"("enabled", "nextRunAt");
