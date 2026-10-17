-- Did the source record landings for this sector? 0 is an answer; null is not.
ALTER TABLE "FlightLog" ADD COLUMN IF NOT EXISTS "landingsRecorded" BOOLEAN;

-- Backfill what can be known for certain:
--  · a scanned or manually entered flight always had the question asked;
UPDATE "FlightLog" SET "landingsRecorded" = true
 WHERE "landingsRecorded" IS NULL AND "source" IN ('MANUAL', 'SCAN');

--  · an imported row whose batch contains any landing came from a file that
--    had the column, so every row in that batch was recorded (0 included);
UPDATE "FlightLog" f SET "landingsRecorded" = true
 WHERE f."landingsRecorded" IS NULL
   AND f."importBatchId" IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM "FlightLog" b
      WHERE b."importBatchId" = f."importBatchId"
        AND (COALESCE(b."landingsDay", 0) + COALESCE(b."landingsNight", 0)) > 0
   );

--  · a row with a landing on it recorded one by definition.
UPDATE "FlightLog" SET "landingsRecorded" = true
 WHERE "landingsRecorded" IS NULL
   AND (COALESCE("landingsDay", 0) + COALESCE("landingsNight", 0)) > 0;

-- Everything still NULL is genuinely unknown, and now says so.
