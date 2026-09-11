-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoFetchedAt" TIMESTAMP(3),
ADD COLUMN     "logoKey" TEXT;

-- AlterTable
ALTER TABLE "JobSource" ADD COLUMN     "domain" TEXT;
