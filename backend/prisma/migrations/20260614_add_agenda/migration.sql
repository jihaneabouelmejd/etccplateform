-- CreateTable: objectifs
CREATE TABLE "objectifs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT,
    "user_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objectifs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_google_tokens
CREATE TABLE "user_google_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expiry_date" BIGINT,
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_google_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "objectifs_user_id_idx" ON "objectifs"("user_id");
CREATE INDEX "objectifs_project_id_idx" ON "objectifs"("project_id");
CREATE UNIQUE INDEX "user_google_tokens_user_id_key" ON "user_google_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "objectifs" ADD CONSTRAINT "objectifs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "objectifs" ADD CONSTRAINT "objectifs_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_google_tokens" ADD CONSTRAINT "user_google_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
