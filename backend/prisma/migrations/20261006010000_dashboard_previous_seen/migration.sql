-- Additive: track the previous dashboard-visit start for a stable "new since last
-- visit" window (refreshing within 30 min keeps the same new jobs). No data change.
ALTER TABLE "Pilot" ADD COLUMN "previousDashboardSeenAt" TIMESTAMP(3);
