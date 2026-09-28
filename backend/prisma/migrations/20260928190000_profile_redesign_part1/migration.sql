-- Profile redesign Part 1: new fields + tables + data migration.
-- (A fresh prod pg_dump was taken before this migration; disk 7%.)

-- 1. Open-to-work (airlines filter on it) + availability.
ALTER TABLE "Pilot" ADD COLUMN "openToWork" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Pilot" ADD COLUMN "availableFrom" TIMESTAMP(3);

-- 2. Ratings: optional link to a licence + line-check date.
ALTER TABLE "PilotRating" ADD COLUMN "licenceId" TEXT;
ALTER TABLE "PilotRating" ADD COLUMN "lineCheckDate" TIMESTAMP(3);
ALTER TABLE "PilotRating"
  ADD CONSTRAINT "PilotRating_licenceId_fkey"
  FOREIGN KEY ("licenceId") REFERENCES "PilotCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Rich education + languages as first-class profile tables (CV source of truth).
CREATE TABLE "PilotEducation" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "institution" TEXT,
  "degree" TEXT,
  "fieldOfStudy" TEXT,
  "year" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotEducation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PilotLanguage" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "level" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotLanguage_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PilotEducation"
  ADD CONSTRAINT "PilotEducation_pilotId_fkey"
  FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotLanguage"
  ADD CONSTRAINT "PilotLanguage_pilotId_fkey"
  FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PilotEducation_pilotId_idx" ON "PilotEducation"("pilotId");
CREATE INDEX "PilotLanguage_pilotId_idx" ON "PilotLanguage"("pilotId");

-- 4. Licence-authority cleanup: the stored free-text "ICAO" (not a regulatory
-- authority) becomes "unknown"; the pilot is prompted to pick the real one. The
-- shared match function treats "unknown" as ? (never a fail). EASA/FAA etc. kept.
UPDATE "PilotCertificate" SET "issuingAuthority" = 'unknown' WHERE "issuingAuthority" = 'ICAO';
UPDATE "PilotRating"      SET "issuingAuthority" = 'unknown' WHERE "issuingAuthority" = 'ICAO';

-- 5. Copy CvData.education / languages into the new profile tables (source-of-truth
-- step A). Old CvData columns are left untouched (dropped later in step B). Only
-- rows with real content are copied.
INSERT INTO "PilotEducation" ("id", "pilotId", "institution", "degree", "fieldOfStudy", "year", "sortOrder", "createdAt")
SELECT gen_random_uuid(), c."pilotId",
       NULLIF(e->>'institution',''), NULLIF(e->>'degree',''), NULLIF(e->>'fieldOfStudy',''), NULLIF(e->>'year',''),
       (ord - 1)::int, CURRENT_TIMESTAMP
FROM "CvData" c, jsonb_array_elements(c."education") WITH ORDINALITY AS t(e, ord)
WHERE NULLIF(e->>'institution','') IS NOT NULL
   OR NULLIF(e->>'degree','') IS NOT NULL
   OR NULLIF(e->>'fieldOfStudy','') IS NOT NULL;

INSERT INTO "PilotLanguage" ("id", "pilotId", "language", "level", "sortOrder", "createdAt")
SELECT gen_random_uuid(), c."pilotId",
       NULLIF(l->>'language',''), NULLIF(l->>'level',''), (ord - 1)::int, CURRENT_TIMESTAMP
FROM "CvData" c, jsonb_array_elements(c."languages") WITH ORDINALITY AS t(l, ord)
WHERE NULLIF(l->>'language','') IS NOT NULL;
