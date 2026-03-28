-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "KardexRefType" ADD VALUE 'ACCOUNT_REACTIVATION';
ALTER TYPE "KardexRefType" ADD VALUE 'ACCOUNT_DELETION';
ALTER TYPE "KardexRefType" ADD VALUE 'ACCOUNT_UPDATE';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "google_connected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "google_refresh_token" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "google_contact_id" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "google_contact_id" TEXT;
