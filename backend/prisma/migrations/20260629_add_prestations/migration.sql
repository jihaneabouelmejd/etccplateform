-- CreateEnum
CREATE TYPE "PrestationStatut" AS ENUM ('EN_COURS', 'TERMINEE', 'ANNULEE');

-- CreateTable
CREATE TABLE "prestations" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "date_debut" TIMESTAMP(3),
    "date_fin" TIMESTAMP(3),
    "description" TEXT,
    "statut" "PrestationStatut" NOT NULL DEFAULT 'EN_COURS',
    "devis_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prestations_created_by_idx" ON "prestations"("created_by");

-- CreateIndex
CREATE INDEX "prestations_devis_id_idx" ON "prestations"("devis_id");

-- AddForeignKey
ALTER TABLE "prestations" ADD CONSTRAINT "prestations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestations" ADD CONSTRAINT "prestations_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
