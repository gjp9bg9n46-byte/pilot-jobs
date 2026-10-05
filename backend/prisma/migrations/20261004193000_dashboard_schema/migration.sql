-- Dashboard + unified match %: additive only. No drops, no data loss.

-- Instructor / examiner privileges (pilot-set; matching input for FI/TRI/TRE/SFI/SFE roles)
CREATE TYPE "InstructorKind" AS ENUM ('FI', 'CRI', 'IRI', 'TRI', 'SFI', 'TRE', 'SFE', 'OTHER');

-- Application lifecycle: add Opened/Interview/Offer/Not-selected/Closed (keep existing values)
ALTER TYPE "ApplicationStatus" ADD VALUE 'OPENED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'INTERVIEW';
ALTER TYPE "ApplicationStatus" ADD VALUE 'OFFER';
ALTER TYPE "ApplicationStatus" ADD VALUE 'NOT_SELECTED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'CLOSED';

-- "New jobs since your last visit"
ALTER TABLE "Pilot" ADD COLUMN "dashboardSeenAt" TIMESTAMP(3);

-- Licence aircraft category (aeroplane | helicopter); backfilled from ratings only, null = unknown
ALTER TABLE "PilotCertificate" ADD COLUMN "category" TEXT;

-- Instructor/examiner privileges table
CREATE TABLE "PilotInstructorRating" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "kind" "InstructorKind" NOT NULL,
    "expiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PilotInstructorRating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PilotInstructorRating_pilotId_kind_key" ON "PilotInstructorRating"("pilotId", "kind");
ALTER TABLE "PilotInstructorRating" ADD CONSTRAINT "PilotInstructorRating_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
