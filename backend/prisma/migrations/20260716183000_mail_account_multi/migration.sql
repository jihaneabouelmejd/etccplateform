-- Support multiple mail accounts per user (primary + shared)

-- DropIndex (was: user_id unique)
DROP INDEX IF EXISTS "mail_accounts_user_id_key";

-- AddColumn
ALTER TABLE "mail_accounts" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "mail_accounts_user_id_email_address_key" ON "mail_accounts"("user_id", "email_address");
