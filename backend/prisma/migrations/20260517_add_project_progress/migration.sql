-- Add progress field to projects table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;
