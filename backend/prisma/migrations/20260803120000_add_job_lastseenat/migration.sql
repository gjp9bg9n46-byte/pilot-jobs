-- Freshness backstop: track when a scrape last returned each row.
-- Existing rows get NULL (honest — we did not observe them under this field);
-- the expireUnseen backstop falls back to updatedAt for NULL rows during the
-- transition, so no timestamp is fabricated to make stale data look fresh.
ALTER TABLE "Job" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
