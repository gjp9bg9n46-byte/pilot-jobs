-- Logbook rebuild: voyage-report scan + the new manual entry. Additive only.

-- New source for rows created from a scan.
ALTER TYPE "LogSource" ADD VALUE IF NOT EXISTS 'SCAN';

-- Per-sector facts the new logbook records.
ALTER TABLE "FlightLog" ADD COLUMN IF NOT EXISTS "pilotFlying" BOOLEAN;
ALTER TABLE "FlightLog" ADD COLUMN IF NOT EXISTS "approach"    TEXT;
ALTER TABLE "FlightLog" ADD COLUMN IF NOT EXISTS "scanId"      TEXT;

-- Logbook preferences: hh:mm vs decimal, role preset, remembered aircraft /
-- registration / commander, and the keep-the-photo opt-in.
ALTER TABLE "Pilot" ADD COLUMN IF NOT EXISTS "logbookPrefs" JSONB;

-- One row per scan. The image is cleared on save unless the pilot keeps it.
CREATE TABLE IF NOT EXISTS "LogbookScan" (
  "id"         TEXT NOT NULL,
  "pilotId"    TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'REVIEW',
  "model"      TEXT,
  "mimeType"   TEXT,
  "imageData"  BYTEA,
  "imageKept"  BOOLEAN NOT NULL DEFAULT false,
  "sectors"    JSONB,
  "header"     JSONB,
  "usage"      JSONB,
  "error"      TEXT,
  "savedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogbookScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LogbookScan_pilotId_createdAt_idx" ON "LogbookScan"("pilotId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "LogbookScan" ADD CONSTRAINT "LogbookScan_pilotId_fkey"
    FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
