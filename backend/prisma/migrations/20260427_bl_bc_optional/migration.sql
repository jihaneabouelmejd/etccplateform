-- Make bc_id optional on BonLivraison (allow direct devis->BL flow)
ALTER TABLE "bons_livraison" ALTER COLUMN "bc_id" DROP NOT NULL;
