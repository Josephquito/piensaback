/*
  Warnings:

  - The values [ROLES] on the enum `PermissionResource` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `role_id` on the `company_users` table. All the data in the column will be lost.
  - You are about to drop the `company_user_permissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `role_permissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `roles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_roles` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "BaseRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'EMPLOYEE');

-- AlterEnum
BEGIN;
CREATE TYPE "PermissionResource_new" AS ENUM ('USERS', 'PERMISSIONS', 'COMPANIES', 'SUPPLIERS', 'CUSTOMERS', 'PRODUCTS', 'ACCOUNTS', 'INVENTORY', 'SLOTS', 'SLOT_SALES');
ALTER TABLE "permissions" ALTER COLUMN "resource" TYPE "PermissionResource_new" USING ("resource"::text::"PermissionResource_new");
ALTER TYPE "PermissionResource" RENAME TO "PermissionResource_old";
ALTER TYPE "PermissionResource_new" RENAME TO "PermissionResource";
DROP TYPE "public"."PermissionResource_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."company_user_permissions" DROP CONSTRAINT "company_user_permissions_company_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."company_user_permissions" DROP CONSTRAINT "company_user_permissions_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."company_users" DROP CONSTRAINT "company_users_role_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."role_permissions" DROP CONSTRAINT "role_permissions_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."roles" DROP CONSTRAINT "roles_owner_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_roles" DROP CONSTRAINT "user_roles_role_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_roles" DROP CONSTRAINT "user_roles_user_id_fkey";

-- AlterTable
ALTER TABLE "company_users" DROP COLUMN "role_id";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "base_role" "BaseRole" NOT NULL DEFAULT 'EMPLOYEE';

-- DropTable
DROP TABLE "public"."company_user_permissions";

-- DropTable
DROP TABLE "public"."role_permissions";

-- DropTable
DROP TABLE "public"."roles";

-- DropTable
DROP TABLE "public"."user_roles";

-- DropEnum
DROP TYPE "public"."RoleScope";

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission_id")
);

-- CreateIndex
CREATE INDEX "user_permissions_permission_id_idx" ON "user_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "users_created_by_user_id_idx" ON "users"("created_by_user_id");

-- CreateIndex
CREATE INDEX "users_base_role_idx" ON "users"("base_role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
