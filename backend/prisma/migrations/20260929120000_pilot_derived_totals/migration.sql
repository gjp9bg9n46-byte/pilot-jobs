-- Denormalised derived flight totals (perf: matching reads one field instead of
-- loading every flight). Backfilled by a script + lazily on first read. Nullable.
ALTER TABLE "Pilot" ADD COLUMN "derivedTotals" JSONB;
