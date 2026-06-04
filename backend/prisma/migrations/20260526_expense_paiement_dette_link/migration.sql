-- Migration: Lier automatiquement les paiements main d'oeuvre aux dépenses
-- Ajoute paiement_dette_id sur la table expenses pour tracer l'origine

ALTER TABLE "expenses"
  ADD COLUMN "paiement_dette_id" TEXT UNIQUE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_paiement_dette_id_fkey"
  FOREIGN KEY ("paiement_dette_id")
  REFERENCES "paiements_dettes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
