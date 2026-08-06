-- Marker so an aggregator job's listing page is fetched at most once for
-- description enrichment (success or attempted).
ALTER TABLE "Job" ADD COLUMN "descriptionEnrichedAt" TIMESTAMP(3);
