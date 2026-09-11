-- Unité de mesure par ligne de devis (m², m³, kg, U, ml...)

-- AddColumn
ALTER TABLE "devis_lines" ADD COLUMN "unit" TEXT;
