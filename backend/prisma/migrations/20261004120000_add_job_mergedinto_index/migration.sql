-- Index for dedup: canonical lookups and the chain-flatten updateMany filter by
-- mergedInto. Without it, `WHERE "mergedInto" IN (...)` is a full scan of ~25k
-- rows (it hung ~10min on the slow prod DB during a re-canonicalisation).
CREATE INDEX "Job_mergedInto_idx" ON "Job"("mergedInto");
