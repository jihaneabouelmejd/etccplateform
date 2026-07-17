-- CreateTable: project_assignments (multi-assignés sur Chantier)
CREATE TABLE "project_assignments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: prestation_assignments (multi-assignés sur Prestation)
CREATE TABLE "prestation_assignments" (
    "id" TEXT NOT NULL,
    "prestation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prestation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_assignments_project_id_user_id_key" ON "project_assignments"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "prestation_assignments_prestation_id_user_id_key" ON "prestation_assignments"("prestation_id", "user_id");

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation_assignments" ADD CONSTRAINT "prestation_assignments_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "prestations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestation_assignments" ADD CONSTRAINT "prestation_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: lien Devis -> Prestation
ALTER TABLE "devis" ADD COLUMN "prestation_id" TEXT;

-- CreateIndex
CREATE INDEX "devis_prestation_id_idx" ON "devis"("prestation_id");

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "prestations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: lien BonCommande -> Prestation
ALTER TABLE "bons_commande" ADD COLUMN "prestation_id" TEXT;

-- CreateIndex
CREATE INDEX "bons_commande_prestation_id_idx" ON "bons_commande"("prestation_id");

-- AddForeignKey
ALTER TABLE "bons_commande" ADD CONSTRAINT "bons_commande_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "prestations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: lien BonLivraison -> Prestation
ALTER TABLE "bons_livraison" ADD COLUMN "prestation_id" TEXT;

-- CreateIndex
CREATE INDEX "bons_livraison_prestation_id_idx" ON "bons_livraison"("prestation_id");

-- AddForeignKey
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "prestations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: lien Invoice -> Prestation
ALTER TABLE "invoices" ADD COLUMN "prestation_id" TEXT;

-- CreateIndex
CREATE INDEX "invoices_prestation_id_idx" ON "invoices"("prestation_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "prestations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- expenses.prestation_id existe déjà (colonne ajoutée par 20260604_expense_prestation_link) mais n'était
-- pas contrainte par une vraie FK. On nettoie d'éventuelles valeurs orphelines avant de poser la contrainte.
UPDATE "expenses" SET "prestation_id" = NULL WHERE "prestation_id" IS NOT NULL AND "prestation_id" NOT IN (SELECT "id" FROM "prestations");

-- CreateIndex
CREATE INDEX "expenses_prestation_id_idx" ON "expenses"("prestation_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "prestations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
