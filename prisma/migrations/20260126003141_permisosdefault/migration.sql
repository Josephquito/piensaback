/*
  Warnings:

  - The values [SUPPLIERS,CUSTOMERS,PRODUCTS,ACCOUNTS,INVENTORY,SLOTS,SLOT_SALES] on the enum `PermissionResource` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PermissionResource_new" AS ENUM ('USERS', 'PERMISSIONS', 'COMPANIES');
ALTER TABLE "permissions" ALTER COLUMN "resource" TYPE "PermissionResource_new" USING ("resource"::text::"PermissionResource_new");
ALTER TYPE "PermissionResource" RENAME TO "PermissionResource_old";
ALTER TYPE "PermissionResource_new" RENAME TO "PermissionResource";
DROP TYPE "public"."PermissionResource_old";
COMMIT;

-- DropIndex
DROP INDEX "public"."permissions_resource_action_key";

-- CreateTable
CREATE TABLE "role_permissions" (
    "base_role" "BaseRole" NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("base_role","permission_id")
);

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "role_permissions_base_role_idx" ON "role_permissions"("base_role");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
