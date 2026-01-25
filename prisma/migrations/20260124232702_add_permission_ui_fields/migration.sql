/*
  Warnings:

  - The `status` column on the `company_users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `account_slots` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `accounts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `customers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inventory_movements` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_inventory_balances` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `slot_sales` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suppliers` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `resource` on the `permissions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "CompanyUserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PermissionResource" AS ENUM ('USERS', 'ROLES', 'PERMISSIONS', 'COMPANIES', 'SUPPLIERS', 'CUSTOMERS', 'PRODUCTS', 'ACCOUNTS', 'INVENTORY', 'SLOTS', 'SLOT_SALES');

-- AlterEnum
ALTER TYPE "CompanyStatus" ADD VALUE 'PENDING_DELETE';

-- DropForeignKey
ALTER TABLE "public"."account_slots" DROP CONSTRAINT "account_slots_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."account_slots" DROP CONSTRAINT "account_slots_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."accounts" DROP CONSTRAINT "accounts_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."accounts" DROP CONSTRAINT "accounts_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."accounts" DROP CONSTRAINT "accounts_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."accounts" DROP CONSTRAINT "accounts_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."customers" DROP CONSTRAINT "customers_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."customers" DROP CONSTRAINT "customers_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."inventory_movements" DROP CONSTRAINT "inventory_movements_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."inventory_movements" DROP CONSTRAINT "inventory_movements_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."inventory_movements" DROP CONSTRAINT "inventory_movements_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."inventory_movements" DROP CONSTRAINT "inventory_movements_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."inventory_movements" DROP CONSTRAINT "inventory_movements_slot_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."product_inventory_balances" DROP CONSTRAINT "product_inventory_balances_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."product_inventory_balances" DROP CONSTRAINT "product_inventory_balances_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."products" DROP CONSTRAINT "products_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."products" DROP CONSTRAINT "products_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."slot_sales" DROP CONSTRAINT "slot_sales_account_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."slot_sales" DROP CONSTRAINT "slot_sales_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."slot_sales" DROP CONSTRAINT "slot_sales_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."slot_sales" DROP CONSTRAINT "slot_sales_product_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."slot_sales" DROP CONSTRAINT "slot_sales_slot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."slot_sales" DROP CONSTRAINT "slot_sales_sold_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."suppliers" DROP CONSTRAINT "suppliers_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."suppliers" DROP CONSTRAINT "suppliers_created_by_user_id_fkey";

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "delete_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "delete_confirmed_by" INTEGER,
ADD COLUMN     "delete_requested_at" TIMESTAMP(3),
ADD COLUMN     "delete_requested_by" INTEGER;

-- AlterTable
ALTER TABLE "company_users" DROP COLUMN "status",
ADD COLUMN     "status" "CompanyUserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "group" TEXT,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "order" INTEGER,
DROP COLUMN "resource",
ADD COLUMN     "resource" "PermissionResource" NOT NULL;

-- DropTable
DROP TABLE "public"."account_slots";

-- DropTable
DROP TABLE "public"."accounts";

-- DropTable
DROP TABLE "public"."customers";

-- DropTable
DROP TABLE "public"."inventory_movements";

-- DropTable
DROP TABLE "public"."product_inventory_balances";

-- DropTable
DROP TABLE "public"."products";

-- DropTable
DROP TABLE "public"."slot_sales";

-- DropTable
DROP TABLE "public"."suppliers";

-- DropEnum
DROP TYPE "public"."AccountSlotStatus";

-- DropEnum
DROP TYPE "public"."AccountStatus";

-- DropEnum
DROP TYPE "public"."InventoryMovementType";

-- DropEnum
DROP TYPE "public"."ProductType";

-- DropEnum
DROP TYPE "public"."SlotSaleStatus";

-- CreateIndex
CREATE INDEX "company_user_permissions_permission_id_idx" ON "company_user_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "company_users_user_id_idx" ON "company_users"("user_id");

-- CreateIndex
CREATE INDEX "company_users_company_id_idx" ON "company_users"("company_id");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_delete_requested_by_fkey" FOREIGN KEY ("delete_requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_delete_confirmed_by_fkey" FOREIGN KEY ("delete_confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
