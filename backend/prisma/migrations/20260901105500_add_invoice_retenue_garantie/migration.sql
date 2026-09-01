-- Ajoute le taux de retenue de garantie (%) sur la facture.
-- Champ purement informatif pour le PDF : n'affecte pas total_ttc/balance,
-- affiche simplement "Retenue de garantie (%)" et "Montant TTC à régler
-- avec retenue de garantie" quand le taux est > 0 (masqué sinon).

-- AddColumn
ALTER TABLE "invoices" ADD COLUMN "retenue_garantie_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
