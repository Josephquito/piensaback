-- AlterTable
ALTER TABLE "account_profiles" ADD COLUMN     "label_id" INTEGER;

-- CreateTable
CREATE TABLE "profile_labels" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_labels_company_id_idx" ON "profile_labels"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_labels_company_id_name_key" ON "profile_labels"("company_id", "name");

-- CreateIndex
CREATE INDEX "account_profiles_label_id_idx" ON "account_profiles"("label_id");

-- AddForeignKey
ALTER TABLE "account_profiles" ADD CONSTRAINT "account_profiles_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "profile_labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_labels" ADD CONSTRAINT "profile_labels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
