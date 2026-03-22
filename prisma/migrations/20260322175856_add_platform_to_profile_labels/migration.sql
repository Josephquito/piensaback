/*
  Warnings:

  - A unique constraint covering the columns `[company_id,platform_id,name]` on the table `profile_labels` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `platform_id` to the `profile_labels` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."profile_labels_company_id_name_key";

-- AlterTable
ALTER TABLE "profile_labels" ADD COLUMN     "platform_id" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "profile_labels_platform_id_idx" ON "profile_labels"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_labels_company_id_platform_id_name_key" ON "profile_labels"("company_id", "platform_id", "name");

-- AddForeignKey
ALTER TABLE "profile_labels" ADD CONSTRAINT "profile_labels_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "streaming_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
