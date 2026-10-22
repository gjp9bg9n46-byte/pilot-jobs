-- Night time can be UNKNOWN, which is not the same as none.
--
-- A sector whose airport code we cannot resolve has no coordinates, so the sun
-- cannot be worked out and the form gave us nothing: storing 0 there would
-- assert "this flight had no night time", which we do not know. The column
-- becomes nullable so unknown can be recorded as unknown and shown as "—".
-- Existing rows keep their values; the default stays 0 for the ordinary case.
ALTER TABLE "FlightLog" ALTER COLUMN "nightTime" DROP NOT NULL;
