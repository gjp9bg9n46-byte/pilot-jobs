-- CV Builder: per-pilot presentation settings + read-only share link.
-- Additive only: every column is nullable or has a default, so existing rows
-- keep working unchanged and nothing is backfilled.
ALTER TABLE "CvData" ADD COLUMN "template"     TEXT    NOT NULL DEFAULT 'classic';
ALTER TABLE "CvData" ADD COLUMN "accent"       TEXT    NOT NULL DEFAULT 'navy';
ALTER TABLE "CvData" ADD COLUMN "sections"     JSONB;              -- null = the default order, all visible
ALTER TABLE "CvData" ADD COLUMN "shareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CvData" ADD COLUMN "shareToken"   TEXT;
CREATE UNIQUE INDEX "CvData_shareToken_key" ON "CvData"("shareToken");
