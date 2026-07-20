-- CreateEnum
CREATE TYPE "MarcheStage" AS ENUM ('NOUVEAU', 'RETENU', 'EN_PREPARATION', 'A_VALIDER', 'DEPOSE', 'GAGNE', 'PERDU');

-- CreateEnum
CREATE TYPE "MarcheDocType" AS ENUM ('ADMINISTRATIF', 'TECHNIQUE', 'FINANCIER', 'AUTRE');

-- CreateTable: marches_prives (module Marchés Privés — nouveau, indépendant)
CREATE TABLE "marches_prives" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "objet" TEXT NOT NULL,
    "client_id" TEXT,
    "client_name" TEXT,
    "ville" TEXT,
    "budget_estimatif" DECIMAL(14,2),
    "devise" TEXT DEFAULT 'MAD',
    "date_limite" TIMESTAMP(3),
    "source" TEXT,
    "score_ia" INTEGER,
    "stage" "MarcheStage" NOT NULL DEFAULT 'NOUVEAU',
    "refuse_reason" TEXT,
    "dossier_admin_ok" BOOLEAN NOT NULL DEFAULT false,
    "dossier_technique_ok" BOOLEAN NOT NULL DEFAULT false,
    "dossier_financier_ok" BOOLEAN NOT NULL DEFAULT false,
    "valide_par_id" TEXT,
    "valide_at" TIMESTAMP(3),
    "date_depot" TIMESTAMP(3),
    "responsable_depot_id" TEXT,
    "depot_notes" TEXT,
    "cause_perte" TEXT,
    "montant_final" DECIMAL(14,2),
    "project_id" TEXT,
    "responsable_id" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marches_prives_pkey" PRIMARY KEY ("id")
);

-- CreateTable: marche_documents (bibliothèque documentaire du dossier)
CREATE TABLE "marche_documents" (
    "id" TEXT NOT NULL,
    "marche_id" TEXT NOT NULL,
    "type" "MarcheDocType" NOT NULL DEFAULT 'AUTRE',
    "nom" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT false,
    "valide" BOOLEAN NOT NULL DEFAULT false,
    "expire_at" TIMESTAMP(3),
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marche_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: marche_depenses (dépenses liées à la préparation d'un dossier)
CREATE TABLE "marche_depenses" (
    "id" TEXT NOT NULL,
    "marche_id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categorie" TEXT,
    "notes" TEXT,
    "transferred_to_expense_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marche_depenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marches_prives_project_id_key" ON "marches_prives"("project_id");

-- CreateIndex
CREATE INDEX "marches_prives_stage_idx" ON "marches_prives"("stage");

-- CreateIndex
CREATE INDEX "marches_prives_client_id_idx" ON "marches_prives"("client_id");

-- CreateIndex
CREATE INDEX "marches_prives_date_limite_idx" ON "marches_prives"("date_limite");

-- CreateIndex
CREATE INDEX "marche_documents_marche_id_idx" ON "marche_documents"("marche_id");

-- CreateIndex
CREATE INDEX "marche_depenses_marche_id_idx" ON "marche_depenses"("marche_id");

-- AddForeignKey
ALTER TABLE "marches_prives" ADD CONSTRAINT "marches_prives_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marches_prives" ADD CONSTRAINT "marches_prives_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marche_documents" ADD CONSTRAINT "marche_documents_marche_id_fkey" FOREIGN KEY ("marche_id") REFERENCES "marches_prives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marche_depenses" ADD CONSTRAINT "marche_depenses_marche_id_fkey" FOREIGN KEY ("marche_id") REFERENCES "marches_prives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
