/*
  Warnings:

  - The `balance` column on the `customers` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "customers" 
ALTER COLUMN "balance" TYPE DECIMAL(12,4) 
USING "balance"::DECIMAL(12,4);
