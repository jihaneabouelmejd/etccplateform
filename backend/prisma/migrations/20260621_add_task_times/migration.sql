-- AlterTable: Add start_time and end_time to tasks
ALTER TABLE "tasks" ADD COLUMN "start_time" TEXT;
ALTER TABLE "tasks" ADD COLUMN "end_time" TEXT;
