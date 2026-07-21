-- Module VEILLE (plateforme de veille commerciale — Entreprises & Consultations)
-- Module additif et totalement independant. Aucune table existante n'est
-- modifiee. Pas d'IA / pas d'API payante : extraction JSON-LD, RSS/Atom,
-- sitemap, selecteurs CSS configurables, heuristiques HTML + regex.

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'JSON_LD', 'SITEMAP', 'HTML_CONFIGURED', 'HTML_GENERIC', 'PLUGIN');

-- CreateEnum
CREATE TYPE "EntrepriseStatus" AS ENUM ('ACTIF', 'A_CONFIGURER', 'DESACTIVE', 'ERREUR');

-- CreateEnum
CREATE TYPE "EntrepriseType" AS ENUM ('PROMOTEUR', 'CONSTRUCTION', 'INDUSTRIE', 'AUTOMOBILE', 'AERONAUTIQUE', 'ENERGIE', 'HOTELLERIE', 'DISTRIBUTION', 'SANTE', 'LOGISTIQUE', 'ENSEIGNEMENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "AnnonceStatus" AS ENUM ('NOUVELLE', 'VUE', 'IMPORTEE', 'IGNOREE', 'EXPIREE');

-- CreateEnum
CREATE TYPE "ScrapeRunStatus" AS ENUM ('SUCCES', 'ECHEC', 'PARTIEL');

-- CreateTable: veille_entreprises
CREATE TABLE "veille_entreprises" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "logo_url" TEXT,
    "secteur" TEXT,
    "ville" TEXT,
    "site_officiel" TEXT,
    "type_entreprise" "EntrepriseType" NOT NULL DEFAULT 'AUTRE',
    "status" "EntrepriseStatus" NOT NULL DEFAULT 'A_CONFIGURER',
    "type" "SourceType" NOT NULL DEFAULT 'HTML_GENERIC',
    "pages_surveillees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "config" JSONB,
    "plugin_key" TEXT,
    "categorie_defaut" TEXT,
    "frequence_cron" TEXT DEFAULT '0 */6 * * *',
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" "ScrapeRunStatus",
    "last_sync_duration_ms" INTEGER,
    "last_sync_count" INTEGER,
    "total_consultations" INTEGER NOT NULL DEFAULT 0,
    "total_erreurs" INTEGER NOT NULL DEFAULT 0,
    "taux_reussite" DOUBLE PRECISION,
    "derniere_consultation_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veille_entreprises_pkey" PRIMARY KEY ("id")
);

-- CreateTable: veille_entreprise_favoris
CREATE TABLE "veille_entreprise_favoris" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veille_entreprise_favoris_pkey" PRIMARY KEY ("id")
);

-- CreateTable: veille_consultations
CREATE TABLE "veille_consultations" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "external_id" TEXT,
    "source_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categorie" TEXT,
    "secteur" TEXT,
    "ville" TEXT,
    "budget_estimatif" DECIMAL(14,2),
    "devise" TEXT,
    "maitre_ouvrage" TEXT,
    "date_publication" TIMESTAMP(3),
    "date_limite" TIMESTAMP(3),
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "content_hash" TEXT NOT NULL,
    "raw_data" JSONB,
    "status" "AnnonceStatus" NOT NULL DEFAULT 'NOUVELLE',
    "imported_marche_id" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veille_consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: veille_consultations_historique
CREATE TABLE "veille_consultations_historique" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "champ" TEXT NOT NULL,
    "ancienne_valeur" TEXT,
    "nouvelle_valeur" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veille_consultations_historique_pkey" PRIMARY KEY ("id")
);

-- CreateTable: veille_scrape_logs
CREATE TABLE "veille_scrape_logs" (
    "id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "status" "ScrapeRunStatus" NOT NULL DEFAULT 'SUCCES',
    "annonces_trouvees" INTEGER NOT NULL DEFAULT 0,
    "annonces_nouvelles" INTEGER NOT NULL DEFAULT 0,
    "annonces_maj" INTEGER NOT NULL DEFAULT 0,
    "erreur" TEXT,

    CONSTRAINT "veille_scrape_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "veille_entreprises_status_idx" ON "veille_entreprises"("status");
CREATE INDEX "veille_entreprises_type_idx" ON "veille_entreprises"("type");
CREATE INDEX "veille_entreprises_type_entreprise_idx" ON "veille_entreprises"("type_entreprise");
CREATE INDEX "veille_entreprises_secteur_idx" ON "veille_entreprises"("secteur");
CREATE INDEX "veille_entreprises_ville_idx" ON "veille_entreprises"("ville");

CREATE UNIQUE INDEX "veille_entreprise_favoris_user_id_entreprise_id_key" ON "veille_entreprise_favoris"("user_id", "entreprise_id");

CREATE UNIQUE INDEX "veille_consultations_entreprise_id_source_url_key" ON "veille_consultations"("entreprise_id", "source_url");
CREATE INDEX "veille_consultations_content_hash_idx" ON "veille_consultations"("content_hash");
CREATE INDEX "veille_consultations_status_idx" ON "veille_consultations"("status");
CREATE INDEX "veille_consultations_ville_idx" ON "veille_consultations"("ville");
CREATE INDEX "veille_consultations_secteur_idx" ON "veille_consultations"("secteur");
CREATE INDEX "veille_consultations_date_limite_idx" ON "veille_consultations"("date_limite");

CREATE INDEX "veille_consultations_historique_consultation_id_idx" ON "veille_consultations_historique"("consultation_id");

CREATE INDEX "veille_scrape_logs_entreprise_id_started_at_idx" ON "veille_scrape_logs"("entreprise_id", "started_at");

-- Foreign keys
ALTER TABLE "veille_entreprise_favoris" ADD CONSTRAINT "veille_entreprise_favoris_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "veille_entreprises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "veille_consultations" ADD CONSTRAINT "veille_consultations_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "veille_entreprises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "veille_consultations_historique" ADD CONSTRAINT "veille_consultations_historique_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "veille_consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "veille_scrape_logs" ADD CONSTRAINT "veille_scrape_logs_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "veille_entreprises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Recherche full-text PostgreSQL (colonne generee, hors schema Prisma) ──
-- Colonne non geree par Prisma (accedee via $queryRaw dans le service de
-- recherche). Alimentee automatiquement par un trigger, aucune app logic
-- necessaire pour la maintenir a jour.

ALTER TABLE "veille_consultations" ADD COLUMN "search_vector" tsvector;

CREATE OR REPLACE FUNCTION veille_consultations_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.categorie, '') || ' ' || coalesce(NEW.secteur, '') || ' ' || coalesce(NEW.ville, '')), 'B') ||
    setweight(to_tsvector('french', array_to_string(coalesce(NEW.keywords, ARRAY[]::TEXT[]), ' ')), 'B') ||
    setweight(to_tsvector('french', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER veille_consultations_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "veille_consultations"
  FOR EACH ROW EXECUTE FUNCTION veille_consultations_search_vector_update();

CREATE INDEX "veille_consultations_search_vector_idx" ON "veille_consultations" USING GIN ("search_vector");
