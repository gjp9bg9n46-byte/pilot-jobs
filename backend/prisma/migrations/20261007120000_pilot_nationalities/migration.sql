-- Additive: multi-nationality pick-list for matching (dual citizens). No data change.
ALTER TABLE "Pilot" ADD COLUMN "nationalities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
