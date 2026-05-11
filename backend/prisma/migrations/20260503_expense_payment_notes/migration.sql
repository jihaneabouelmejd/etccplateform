-- AlterTable
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_method" "PaymentType",
                       ADD COLUMN IF NOT EXISTS "notes" TEXT;
