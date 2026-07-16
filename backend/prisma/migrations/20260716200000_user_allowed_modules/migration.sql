-- Per-user module permission override (e.g. grant a single EMPLOYE full access
-- to a specific set of modules regardless of the default role-based rules).

-- AddColumn
ALTER TABLE "users" ADD COLUMN "allowed_modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
