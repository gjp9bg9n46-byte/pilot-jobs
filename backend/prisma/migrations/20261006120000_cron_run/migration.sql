-- Additive: a trace row for every scheduled task run (no drops, no data change).
CREATE TABLE "CronRun" (
  "id"         TEXT NOT NULL,
  "jobName"    TEXT NOT NULL,
  "host"       TEXT,
  "commit"     TEXT,
  "status"     TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"    TIMESTAMP(3),
  "durationMs" INTEGER,
  "counts"     JSONB,
  "error"      TEXT,
  CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CronRun_jobName_startedAt_idx" ON "CronRun"("jobName", "startedAt");
