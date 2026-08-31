-- Personnalisation libre du PDF de facture : rubriques ajoutées, libellés modifiés,
-- couleurs/police, ordre/visibilité des blocs. Stocké en JSON, par facture.

-- AddColumn
ALTER TABLE "invoices" ADD COLUMN "custom_layout" JSONB;
