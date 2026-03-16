/*
  Warnings:

  - The `source` column on the `customers` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `duration_days` to the `streaming_accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `daily_cost` to the `streaming_sales` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'REFERRAL', 'OTHER');

-- AlterTable
ALTER TABLE "cost_items" ALTER COLUMN "unit" SET DEFAULT 'PROFILE_DAY';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "balance" TEXT,
ADD COLUMN     "last_purchase_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source_note" TEXT,
DROP COLUMN "source",
ADD COLUMN     "source" "CustomerSource";

-- AlterTable
ALTER TABLE "streaming_accounts" ADD COLUMN     "duration_days" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "streaming_sales" ADD COLUMN     "daily_cost" DECIMAL(12,4) NOT NULL;
