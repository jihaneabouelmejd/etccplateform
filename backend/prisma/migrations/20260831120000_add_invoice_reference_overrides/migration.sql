-- Overrides manuels des références (devis/BC/BL) affichées sur le PDF de facture.
-- N'affectent pas le chaînage réel (bl_id/bc_id/devis_id) : uniquement le texte affiché.

-- AddColumn
ALTER TABLE "invoices" ADD COLUMN "ref_devis_override" TEXT;
ALTER TABLE "invoices" ADD COLUMN "ref_bc_override" TEXT;
ALTER TABLE "invoices" ADD COLUMN "ref_bl_override" TEXT;
