/*
  Warnings:

  - You are about to drop the column `failed_count` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `ignored_count` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `purchased_count` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `responded_count` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `sent_count` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `total_contacts` on the `campaigns` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "failed_count",
DROP COLUMN "ignored_count",
DROP COLUMN "purchased_count",
DROP COLUMN "responded_count",
DROP COLUMN "sent_count",
DROP COLUMN "total_contacts";
