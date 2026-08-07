-- Apply-link liveness tracking (nightly checker). Consecutive transient
-- failures accumulate; 3 in a row expires the job. Reset to 0 on any live check.
ALTER TABLE "Job" ADD COLUMN "livenessFailures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "lastLivenessCheckAt" TIMESTAMP(3);
