-- Track the start of an unbroken run of HTTP 403 responses from the apply-link
-- liveness checker. 403 is treated as "skip" (anti-bot vs genuinely gone is
-- ambiguous), so such jobs never expire on their own — this column drives a
-- weekly stuck-403 report. Nullable; cleared when the link next resolves or is
-- judged dead. Purely additive, no backfill.
ALTER TABLE "Job" ADD COLUMN "liveness403Since" TIMESTAMP(3);
