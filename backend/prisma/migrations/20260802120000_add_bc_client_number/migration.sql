-- Numéro du bon de commande tel qu'émis par le client (ex: MAD1-CO014589),
-- distinct du numéro interne de la plateforme (BC-YYYY-NNNN).

-- AddColumn
ALTER TABLE "bons_commande" ADD COLUMN "client_number" TEXT;
