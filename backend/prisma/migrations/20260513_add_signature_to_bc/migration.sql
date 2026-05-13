-- AlterTable: add signature_id to bons_commande
ALTER TABLE "bons_commande" ADD COLUMN "signature_id" TEXT;

-- AddForeignKey
ALTER TABLE "bons_commande" ADD CONSTRAINT "bons_commande_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
