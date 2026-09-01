-- Lien prestation sur les dettes : jusqu'ici les dettes ne pouvaient être
-- rattachées qu'à un chantier (project_id). Le frontend envoyait déjà
-- prestation_id/prestation_nom lors de la création/édition d'une dette,
-- mais ces champs étaient silencieusement ignorés côté backend (absents
-- du modèle Prisma). Cette migration corrige le manque.

-- AddColumn
ALTER TABLE "dettes" ADD COLUMN "prestation_id" TEXT;
ALTER TABLE "dettes" ADD COLUMN "prestation_nom" TEXT;

-- CreateIndex
CREATE INDEX "dettes_project_id_idx" ON "dettes"("project_id");
CREATE INDEX "dettes_prestation_id_idx" ON "dettes"("prestation_id");

-- AddForeignKey
ALTER TABLE "dettes" ADD CONSTRAINT "dettes_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "prestations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
