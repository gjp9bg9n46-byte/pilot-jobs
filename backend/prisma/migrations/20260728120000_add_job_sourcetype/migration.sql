-- Add apply-destination classification (direct_ats | operator_direct | aggregator | null).
-- Additive + nullable: no backfill in-migration; a script populates existing rows.
ALTER TABLE "Job" ADD COLUMN "sourceType" TEXT;
