-- CreateEnum
CREATE TYPE "BLSource" AS ENUM ('INTERNAL', 'IMPORTED_OCR', 'IMPORTED_MANUAL');

-- AlterTable
ALTER TABLE "bons_livraison" ADD COLUMN     "imported_file_url" TEXT,
ADD COLUMN     "ocr_raw_data" JSONB,
ADD COLUMN     "source" "BLSource" NOT NULL DEFAULT 'INTERNAL';
