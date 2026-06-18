-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'REVIEWED', 'SHORTLISTED', 'HIRED');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "matchBreakdown" JSONB,
ADD COLUMN     "matchScore" DOUBLE PRECISION,
ADD COLUMN     "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Application_jobId_idx" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_pilotId_appliedAt_idx" ON "Application"("pilotId", "appliedAt");
