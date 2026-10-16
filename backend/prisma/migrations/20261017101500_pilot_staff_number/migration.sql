-- Staff/crew number, used to tell PF from PM on a scanned voyage report.
ALTER TABLE "Pilot" ADD COLUMN IF NOT EXISTS "staffNumber" TEXT;
