/*
  Warnings:

  - You are about to drop the column `replaced_at` on the `streaming_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `replaced_by_email` on the `streaming_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `replacement_note` on the `streaming_accounts` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ReplacementType" AS ENUM ('CREDENTIALS', 'PAID', 'FROM_INVENTORY');

-- CreateTable
CREATE TABLE "account_replacement_history" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "replacement_type" "ReplacementType" NOT NULL,
    "old_email" TEXT NOT NULL,
    "old_password" TEXT NOT NULL,
    "old_cost" DECIMAL(12,2),
    "old_cutoff_date" TIMESTAMP(3),
    "old_supplier_id" INTEGER,
    "replacement_account_id" INTEGER,
    "note" TEXT,
    "replaced_by_user_id" INTEGER,
    "replaced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_replacement_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_replacement_history_account_id_idx" ON "account_replacement_history"("account_id");
CREATE INDEX "account_replacement_history_company_id_idx" ON "account_replacement_history"("company_id");
CREATE INDEX "account_replacement_history_replacement_type_idx" ON "account_replacement_history"("replacement_type");

-- AddForeignKey
ALTER TABLE "account_replacement_history" ADD CONSTRAINT "account_replacement_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_replacement_history" ADD CONSTRAINT "account_replacement_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "streaming_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_replacement_history" ADD CONSTRAINT "account_replacement_history_old_supplier_id_fkey" FOREIGN KEY ("old_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_replacement_history" ADD CONSTRAINT "account_replacement_history_replacement_account_id_fkey" FOREIGN KEY ("replacement_account_id") REFERENCES "streaming_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_replacement_history" ADD CONSTRAINT "account_replacement_history_replaced_by_user_id_fkey" FOREIGN KEY ("replaced_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrar los 8 registros existentes antes de eliminar los campos viejos
INSERT INTO "account_replacement_history" (
  "company_id",
  "account_id",
  "replacement_type",
  "old_email",
  "old_password",
  "old_cost",
  "old_cutoff_date",
  "note",
  "replaced_at"
)
SELECT
  sa."company_id",
  sa."id",
  'CREDENTIALS'::"ReplacementType",
  sa."replaced_by_email",
  sa."password",
  sa."total_cost",
  sa."cutoff_date",
  sa."replacement_note",
  COALESCE(sa."replaced_at", NOW())
FROM "streaming_accounts" sa
WHERE sa."replaced_by_email" IS NOT NULL;

-- Verificar que se migraron correctamente
DO $$
DECLARE
  original_count INT;
  migrated_count INT;
BEGIN
  SELECT COUNT(*) INTO original_count FROM "streaming_accounts" WHERE "replaced_by_email" IS NOT NULL;
  SELECT COUNT(*) INTO migrated_count FROM "account_replacement_history";
  
  IF original_count != migrated_count THEN
    RAISE EXCEPTION 'Migración incompleta: % registros originales, % migrados', original_count, migrated_count;
  END IF;
END $$;

-- Recién ahora eliminar los campos viejos
ALTER TABLE "streaming_accounts" DROP COLUMN "replaced_at";
ALTER TABLE "streaming_accounts" DROP COLUMN "replaced_by_email";
ALTER TABLE "streaming_accounts" DROP COLUMN "replacement_note";