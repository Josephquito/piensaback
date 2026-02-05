/*
  Warnings:

  - A unique constraint covering the columns `[company_id,name]` on the table `streaming_platforms` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `company_id` to the `streaming_platforms` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."streaming_platforms_name_key";

-- AlterTable
ALTER TABLE "streaming_platforms" ADD COLUMN     "company_id" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "streaming_platforms_company_id_idx" ON "streaming_platforms"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "streaming_platforms_company_id_name_key" ON "streaming_platforms"("company_id", "name");

-- AddForeignKey
ALTER TABLE "streaming_platforms" ADD CONSTRAINT "streaming_platforms_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
