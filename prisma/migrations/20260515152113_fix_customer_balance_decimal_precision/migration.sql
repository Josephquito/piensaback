/*
  Warnings:

  - You are about to alter the column `balance` on the `customers` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,4)` to `Decimal(12,2)`.

*/
-- AlterTable
ALTER TABLE "customers" 
ALTER COLUMN "balance" TYPE DECIMAL(12,2) 
USING "balance"::DECIMAL(12,2);
