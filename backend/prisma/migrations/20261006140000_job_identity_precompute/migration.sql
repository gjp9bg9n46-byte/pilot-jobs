-- Additive: precomputed identity-cluster columns on Job (no drops, no data change).
-- Backfilled by services/jobIdentityStore.recomputeJobIdentity on the first boot.
ALTER TABLE "Job" ADD COLUMN "identityKey" TEXT;
ALTER TABLE "Job" ADD COLUMN "identityFirstSeenAt" TIMESTAMP(3);
CREATE INDEX "Job_identityKey_idx" ON "Job"("identityKey");
