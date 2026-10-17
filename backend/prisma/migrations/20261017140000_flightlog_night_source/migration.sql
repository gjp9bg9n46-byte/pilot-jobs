-- Where a flight's night time came from: the crew's N column, or our sun
-- calculation. A form value must survive a date change.
ALTER TABLE "FlightLog" ADD COLUMN IF NOT EXISTS "nightSource" TEXT;
