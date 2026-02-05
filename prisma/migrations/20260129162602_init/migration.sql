/*
  Warnings:

  - The values [PENDING_DELETE] on the enum `CompanyStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `delete_confirmed_at` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `delete_confirmed_by` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `delete_requested_at` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `delete_requested_by` on the `companies` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CompanyStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "public"."companies" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "status" TYPE "CompanyStatus_new" USING ("status"::text::"CompanyStatus_new");
ALTER TYPE "CompanyStatus" RENAME TO "CompanyStatus_old";
ALTER TYPE "CompanyStatus_new" RENAME TO "CompanyStatus";
DROP TYPE "public"."CompanyStatus_old";
ALTER TABLE "companies" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."companies" DROP CONSTRAINT "companies_delete_confirmed_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."companies" DROP CONSTRAINT "companies_delete_requested_by_fkey";

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "delete_confirmed_at",
DROP COLUMN "delete_confirmed_by",
DROP COLUMN "delete_requested_at",
DROP COLUMN "delete_requested_by";

-- CreateIndex
CREATE INDEX "companies_owner_user_id_idx" ON "companies"("owner_user_id");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");
