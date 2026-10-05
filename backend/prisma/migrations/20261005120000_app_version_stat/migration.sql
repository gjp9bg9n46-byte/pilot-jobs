-- Additive: per-day client-version request tally (backward-compat measurement).
CREATE TABLE "AppVersionStat" (
  "id"      TEXT NOT NULL,
  "day"     TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "count"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AppVersionStat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppVersionStat_day_version_key" ON "AppVersionStat"("day", "version");
