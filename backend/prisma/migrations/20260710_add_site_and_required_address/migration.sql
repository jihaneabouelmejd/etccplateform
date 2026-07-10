-- Backfill NULL client addresses before enforcing NOT NULL
UPDATE "clients" SET "address" = '' WHERE "address" IS NULL;

-- AlterTable: Client.address becomes required
ALTER TABLE "clients" ALTER COLUMN "address" SET NOT NULL;

-- AlterTable: add denormalized "site" (chantier) column, propagated from Devis
ALTER TABLE "devis" ADD COLUMN "site" TEXT;
ALTER TABLE "bons_commande" ADD COLUMN "site" TEXT;
ALTER TABLE "bons_livraison" ADD COLUMN "site" TEXT;
ALTER TABLE "invoices" ADD COLUMN "site" TEXT;
