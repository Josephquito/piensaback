/*
  Warnings:

  - You are about to drop the column `historical_spend` on the `suppliers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "suppliers" DROP COLUMN "historical_spend",
ADD COLUMN     "balance" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT;
