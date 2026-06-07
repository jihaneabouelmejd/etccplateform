-- Migration: Ajouter CANCELLED aux enums DevisStatus et BLStatus
-- À exécuter UNE SEULE FOIS dans votre base de données PostgreSQL
-- Commande : psql -U etcc -d etcc_db -f migration_corbeille.sql

ALTER TYPE "DevisStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "BLStatus"    ADD VALUE IF NOT EXISTS 'CANCELLED';
