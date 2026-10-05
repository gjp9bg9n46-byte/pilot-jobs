-- Option 3: two additive columns. reqAircraftTypes (legacy, fleet-inclusive) is left
-- untouched so deployed search/facets/airline pages keep working. No drops, no backfill
-- here (backfill runs post-deploy with the updatedAt guard).

-- aircraftTypes: what the job FLIES (title + legacy rated types) — search/display.
ALTER TABLE "Job" ADD COLUMN "aircraftTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

-- reqTypeRatings: type rating REQUIRED (trigger-gated) — matching only.
ALTER TABLE "Job" ADD COLUMN "reqTypeRatings" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
