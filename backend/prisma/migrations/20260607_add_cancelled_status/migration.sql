-- Add CANCELLED status to DevisStatus and BLStatus enums
-- Already applied manually via psql — this file records it in Prisma migration history

ALTER TYPE "DevisStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "BLStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
