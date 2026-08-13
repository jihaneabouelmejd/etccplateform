-- CreateEnum
CREATE TYPE "BRStatus" AS ENUM ('ACTIF', 'ANNULE');

-- CreateTable
CREATE TABLE "bons_reception" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "bc_id" TEXT NOT NULL,
    "site" TEXT,
    "imported_file_url" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "project_id" TEXT,
    "created_by" TEXT NOT NULL,
    "reception_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "BRStatus" NOT NULL DEFAULT 'ACTIF',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bons_reception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bons_reception_number_key" ON "bons_reception"("number");

-- CreateIndex
CREATE INDEX "bons_reception_bc_id_idx" ON "bons_reception"("bc_id");

-- CreateIndex
CREATE INDEX "bons_reception_client_id_idx" ON "bons_reception"("client_id");

-- CreateIndex
CREATE INDEX "bons_reception_status_idx" ON "bons_reception"("status");

-- AddForeignKey
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_bc_id_fkey" FOREIGN KEY ("bc_id") REFERENCES "bons_commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons_reception" ADD CONSTRAINT "bons_reception_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
