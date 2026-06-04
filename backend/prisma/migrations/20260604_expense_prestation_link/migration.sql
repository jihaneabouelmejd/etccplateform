-- Add prestation_id and prestation_nom to expenses
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "prestation_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "prestation_nom" TEXT;
