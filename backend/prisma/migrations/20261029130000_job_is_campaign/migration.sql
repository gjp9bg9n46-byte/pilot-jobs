-- A standing recruitment campaign is not a vacancy. Additive, defaults false,
-- so every existing row keeps behaving exactly as it does today.
ALTER TABLE "Job" ADD COLUMN "isCampaign" BOOLEAN NOT NULL DEFAULT false;
