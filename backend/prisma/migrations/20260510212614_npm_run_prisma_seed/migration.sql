/*
  Warnings:

  - The `mode` column on the `paiements_dettes` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "bons_livraison" DROP CONSTRAINT "bons_livraison_bc_id_fkey";

-- DropForeignKey
ALTER TABLE "dettes" DROP CONSTRAINT "dettes_project_id_fkey";

-- DropForeignKey
ALTER TABLE "paiements_dettes" DROP CONSTRAINT "paiements_dettes_dette_id_fkey";

-- AlterTable
ALTER TABLE "dettes" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "paiements_dettes" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "mode",
ADD COLUMN     "mode" "PaymentType" NOT NULL DEFAULT 'ESPECES';

-- AddForeignKey
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_bc_id_fkey" FOREIGN KEY ("bc_id") REFERENCES "bons_commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dettes" ADD CONSTRAINT "dettes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements_dettes" ADD CONSTRAINT "paiements_dettes_dette_id_fkey" FOREIGN KEY ("dette_id") REFERENCES "dettes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "paiements_dettes_dette_idx" RENAME TO "paiements_dettes_dette_id_idx";
