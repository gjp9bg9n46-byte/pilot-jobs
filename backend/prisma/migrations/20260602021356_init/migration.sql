-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('ATP', 'CPL', 'PPL', 'MPL', 'ATPL', 'IR', 'ME', 'SE', 'ELP');

-- CreateEnum
CREATE TYPE "MedicalClass" AS ENUM ('CLASS_1', 'CLASS_2', 'CLASS_3');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'FILLED');

-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('MANUAL', 'FOREFLIGHT', 'LOGBOOK_PRO', 'OTHER', 'IMPORTED');

-- CreateEnum
CREATE TYPE "AlertFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('high_school', 'technical', 'bachelor', 'masters', 'doctorate');

-- CreateEnum
CREATE TYPE "PilotRole" AS ENUM ('FIRST_OFFICER', 'CAPTAIN');

-- CreateEnum
CREATE TYPE "HiringStatus" AS ENUM ('ACTIVELY_HIRING', 'OCCASIONAL', 'PAUSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HiringFrequency" AS ENUM ('CONTINUOUS', 'PERIODIC', 'RARE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AirlineContractType" AS ENUM ('PERMANENT', 'FIXED_TERM', 'AGENCY', 'PAY_TO_FLY', 'MIXED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('MEDICAL_EXPIRY', 'LICENCE_EXPIRY', 'TYPE_RATING_EXPIRY', 'ELP_EXPIRY', 'TRAINING_EXPIRY', 'PASSPORT_EXPIRY', 'RTW_EXPIRY');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateTable
CREATE TABLE "Pilot" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "country" TEXT,
    "city" TEXT,
    "nationality" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "passportNumber" TEXT,
    "passportExpiry" TIMESTAMP(3),
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "profilePhoto" TEXT,
    "fcmToken" TEXT,
    "education" "EducationLevel",
    "role" "PilotRole",
    "willingToRelocate" BOOLEAN NOT NULL DEFAULT true,
    "isInstructor" BOOLEAN NOT NULL DEFAULT false,
    "isExaminer" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "notificationPreferences" JSONB NOT NULL DEFAULT '{}',
    "profileVisible" BOOLEAN NOT NULL DEFAULT true,
    "anonymousBrowsing" BOOLEAN NOT NULL DEFAULT false,
    "showSeniority" BOOLEAN NOT NULL DEFAULT true,
    "carryForward" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotCertificate" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "certificateNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "englishLevel" TEXT,
    "endorsements" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotRating" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "aircraftType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "hoursOnType" DOUBLE PRECISION,
    "capacity" TEXT,
    "proficiencyCheckDate" TIMESTAMP(3),
    "proficiencyCheckDue" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotTrainingRecord" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotTrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotRightToWork" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotRightToWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotMedical" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "medicalClass" "MedicalClass" NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotMedical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotPreference" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "preferredCountries" TEXT[],
    "preferredAircraft" TEXT[],
    "minSalary" DOUBLE PRECISION,
    "minSalaryCurrency" TEXT NOT NULL DEFAULT 'USD',
    "minSalaryPeriod" TEXT NOT NULL DEFAULT 'year',
    "salaryNegotiable" BOOLEAN NOT NULL DEFAULT false,
    "preferredContractTypes" TEXT[],
    "routePreferences" TEXT[],
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyMatchesPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyMatchesEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyAlertsPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyApplicationsPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyApplicationsEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyExpiriesPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyExpiriesEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyDigestEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyProductUpdatesEmail" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "quietHoursTz" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilotPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotSession" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "lastIp" TEXT,
    "lastCity" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorSecret" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "backupCodes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightLog" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "dutyId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "flightNumber" TEXT,
    "aircraftType" TEXT NOT NULL,
    "registration" TEXT,
    "departure" TEXT,
    "arrival" TEXT,
    "offBlocksTime" TEXT,
    "takeoffTime" TEXT,
    "landingTime" TEXT,
    "onBlocksTime" TEXT,
    "picName" TEXT,
    "sicName" TEXT,
    "totalTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "picTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sicTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "multiEngineTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "turbineTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jetTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "instrumentTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "instrumentActualTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "instrumentSimTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crossCountryTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nightTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "landingsDay" INTEGER NOT NULL DEFAULT 0,
    "landingsNight" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "source" "LogSource" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlightLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "country" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "applyUrl" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "role" TEXT,
    "contractType" TEXT,
    "region" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "reqCertificates" TEXT[],
    "reqAuthorities" TEXT[],
    "reqAircraftTypes" TEXT[],
    "reqMedicalClass" TEXT,
    "reqMinTotalHours" DOUBLE PRECISION,
    "reqMinPicHours" DOUBLE PRECISION,
    "reqMinMultiEngineHours" DOUBLE PRECISION,
    "reqMinTurbineHours" DOUBLE PRECISION,
    "reqMinInstrumentHours" DOUBLE PRECISION,
    "reqMinCrossCountryHours" DOUBLE PRECISION,
    "reqEducation" TEXT,
    "reqWorkAuthorization" TEXT,
    "reqEnglishLevel" INTEGER,
    "reqWillingToRelocate" BOOLEAN NOT NULL DEFAULT false,
    "sourcePlatform" TEXT,
    "externalId" TEXT,
    "mergedInto" TEXT,
    "lastEnrichedFromWorkdayAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAlert" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB,
    "notifiedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "frequency" "AlertFrequency" NOT NULL DEFAULT 'INSTANT',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "newMatchCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobReport" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvData" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "photoUrl" TEXT,
    "education" JSONB NOT NULL DEFAULT '[]',
    "languages" JSONB NOT NULL DEFAULT '[]',
    "skills" JSONB NOT NULL DEFAULT '[]',
    "other" JSONB NOT NULL DEFAULT '[]',
    "typeRatings" JSONB NOT NULL DEFAULT '[]',
    "licenses" JSONB NOT NULL DEFAULT '[]',
    "medical" JSONB,
    "icaoEnglish" JSONB,
    "accentColor" TEXT NOT NULL DEFAULT '#0D1E35',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Airline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iataCode" TEXT,
    "icaoCode" TEXT,
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "headquarters" TEXT,
    "description" TEXT,
    "bases" TEXT[],
    "fleet" TEXT[],
    "hiringStatus" "HiringStatus" NOT NULL DEFAULT 'UNKNOWN',
    "hiringFrequency" "HiringFrequency" NOT NULL DEFAULT 'UNKNOWN',
    "payRanges" JSONB,
    "rosterPattern" TEXT,
    "contractType" "AirlineContractType",
    "workAuthRequired" TEXT[],
    "avgResponseDays" INTEGER,
    "interviewStages" TEXT[],
    "simType" TEXT,
    "upgradeTimeMinYears" DOUBLE PRECISION,
    "upgradeTimeMaxYears" DOUBLE PRECISION,
    "notes" TEXT,
    "verifiedContributors" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Airline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirlineFactContribution" (
    "id" TEXT NOT NULL,
    "airlineId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AirlineFactContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "documentId" TEXT NOT NULL,
    "daysBeforeExpiry" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_email_key" ON "Pilot"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PilotPreference_pilotId_key" ON "PilotPreference"("pilotId");

-- CreateIndex
CREATE UNIQUE INDEX "PilotSession_tokenHash_key" ON "PilotSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorSecret_pilotId_key" ON "TwoFactorSecret"("pilotId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_sourcePlatform_externalId_key" ON "Job"("sourcePlatform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_pilotId_jobId_key" ON "JobAlert"("pilotId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_pilotId_jobId_key" ON "SavedJob"("pilotId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_pilotId_jobId_key" ON "Application"("pilotId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CvData_pilotId_key" ON "CvData"("pilotId");

-- CreateIndex
CREATE UNIQUE INDEX "Airline_iataCode_key" ON "Airline"("iataCode");

-- CreateIndex
CREATE UNIQUE INDEX "Airline_icaoCode_key" ON "Airline"("icaoCode");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_pilotId_kind_documentId_daysBeforeExpiry_ch_key" ON "NotificationLog"("pilotId", "kind", "documentId", "daysBeforeExpiry", "channel");

-- AddForeignKey
ALTER TABLE "PilotCertificate" ADD CONSTRAINT "PilotCertificate_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotRating" ADD CONSTRAINT "PilotRating_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotTrainingRecord" ADD CONSTRAINT "PilotTrainingRecord_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotRightToWork" ADD CONSTRAINT "PilotRightToWork_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotMedical" ADD CONSTRAINT "PilotMedical_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotPreference" ADD CONSTRAINT "PilotPreference_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotSession" ADD CONSTRAINT "PilotSession_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorSecret" ADD CONSTRAINT "TwoFactorSecret_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightLog" ADD CONSTRAINT "FlightLog_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReport" ADD CONSTRAINT "JobReport_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReport" ADD CONSTRAINT "JobReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvData" ADD CONSTRAINT "CvData_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirlineFactContribution" ADD CONSTRAINT "AirlineFactContribution_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirlineFactContribution" ADD CONSTRAINT "AirlineFactContribution_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirlineFactContribution" ADD CONSTRAINT "AirlineFactContribution_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Pilot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

