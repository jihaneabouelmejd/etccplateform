-- CreateTable
CREATE TABLE "mail_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "password_enc" TEXT NOT NULL,
    "imap_host" TEXT NOT NULL DEFAULT 'imap.hostinger.com',
    "imap_port" INTEGER NOT NULL DEFAULT 993,
    "smtp_host" TEXT NOT NULL DEFAULT 'smtp.hostinger.com',
    "smtp_port" INTEGER NOT NULL DEFAULT 465,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_error" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_accounts_user_id_key" ON "mail_accounts"("user_id");

-- AddForeignKey
ALTER TABLE "mail_accounts" ADD CONSTRAINT "mail_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
