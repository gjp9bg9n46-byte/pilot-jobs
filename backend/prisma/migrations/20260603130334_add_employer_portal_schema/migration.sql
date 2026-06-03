-- CreateEnum
CREATE TYPE "EmployerType" AS ENUM ('AIRLINE', 'CHARTER', 'CARGO', 'EMS', 'FLIGHT_SCHOOL', 'CORPORATE', 'RECRUITER', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "moderationStatus" TEXT DEFAULT 'APPROVED',
ADD COLUMN     "postedByEmployerId" TEXT;

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyType" "EmployerType" NOT NULL,
    "country" TEXT NOT NULL,
    "headquartersCity" TEXT,
    "website" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "iataCode" TEXT,
    "icaoCode" TEXT,
    "contactEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" "EmployerStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "airlineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employer_contactEmail_key" ON "Employer"("contactEmail");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_postedByEmployerId_fkey" FOREIGN KEY ("postedByEmployerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employer" ADD CONSTRAINT "Employer_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

