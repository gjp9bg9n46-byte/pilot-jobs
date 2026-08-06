-- Verbatim requirements section + LLM-extraction marker.
ALTER TABLE "Job" ADD COLUMN "requirementsText" TEXT;
ALTER TABLE "Job" ADD COLUMN "requirementsExtractedAt" TIMESTAMP(3);
