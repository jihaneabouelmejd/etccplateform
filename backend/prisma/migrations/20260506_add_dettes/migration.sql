-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DetteStatut" AS ENUM ('EN_COURS', 'PARTIELLE', 'SOLDEE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable dettes
CREATE TABLE IF NOT EXISTS "dettes" (
  "id"           TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "nom"          TEXT NOT NULL,
  "description"  TEXT NOT NULL,
  "montant"      DECIMAL(10,2) NOT NULL,
  "montant_paye" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "date"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "statut"       "DetteStatut" NOT NULL DEFAULT 'EN_COURS',
  "project_id"   TEXT,
  "notes"        TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dettes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL
);

-- CreateTable paiements_dettes
CREATE TABLE IF NOT EXISTS "paiements_dettes" (
  "id"         TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dette_id"   TEXT NOT NULL,
  "montant"    DECIMAL(10,2) NOT NULL,
  "date"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mode"       TEXT NOT NULL DEFAULT 'ESPECES',
  "notes"      TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paiements_dettes_dette_id_fkey" FOREIGN KEY ("dette_id") REFERENCES "dettes"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "dettes_statut_idx"        ON "dettes"("statut");
CREATE INDEX IF NOT EXISTS "paiements_dettes_dette_idx" ON "paiements_dettes"("dette_id");
