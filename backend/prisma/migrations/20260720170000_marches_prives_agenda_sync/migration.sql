-- Sync Calendrier <-> Agenda (lot 2, module Marches Prives)
-- Ajoute uniquement une colonne optionnelle sur marches_prives, ne touche a
-- aucune table existante (users, tasks, objectifs, etc.).

-- AddColumn
ALTER TABLE "marches_prives" ADD COLUMN "agenda_task_id" TEXT;
