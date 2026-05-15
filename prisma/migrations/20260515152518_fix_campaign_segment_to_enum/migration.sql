/*
  Warnings:

  - The `segment` column on the `campaigns` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "CampaignSegment" AS ENUM ('ALL', 'HOT', 'WARM', 'COLD', 'PROSPECT');

ALTER TABLE "campaigns" 
ALTER COLUMN "segment" TYPE "CampaignSegment" 
USING "segment"::"CampaignSegment";
