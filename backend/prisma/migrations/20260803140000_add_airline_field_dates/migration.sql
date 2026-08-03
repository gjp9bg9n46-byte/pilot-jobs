-- Per-field / per-item recorded dates for airline fact files.
-- Generic key→date table: a single field's date moves independently of all
-- others. Absence of a row = unknown date (rendered "—", never fabricated).
CREATE TABLE "AirlineFieldDate" (
    "id" TEXT NOT NULL,
    "airlineId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AirlineFieldDate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AirlineFieldDate_airlineId_field_key" ON "AirlineFieldDate"("airlineId", "field");
CREATE INDEX "AirlineFieldDate_airlineId_idx" ON "AirlineFieldDate"("airlineId");

ALTER TABLE "AirlineFieldDate" ADD CONSTRAINT "AirlineFieldDate_airlineId_fkey"
    FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
