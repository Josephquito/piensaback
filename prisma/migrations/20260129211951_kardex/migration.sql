-- CreateEnum
CREATE TYPE "StreamingAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AccountProfileStatus" AS ENUM ('AVAILABLE', 'SOLD', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateEnum
CREATE TYPE "KardexType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- CreateEnum
CREATE TYPE "KardexRefType" AS ENUM ('ACCOUNT_PURCHASE', 'PROFILE_SALE', 'ACCOUNT_INACTIVATION', 'PROFILE_ADJUST', 'MANUAL_ADJUST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PermissionResource" ADD VALUE 'STREAMING_PLATFORMS';
ALTER TYPE "PermissionResource" ADD VALUE 'STREAMING_ACCOUNTS';
ALTER TYPE "PermissionResource" ADD VALUE 'STREAMING_SALES';
ALTER TYPE "PermissionResource" ADD VALUE 'KARDEX';

-- CreateTable
CREATE TABLE "streaming_platforms" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaming_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaming_accounts" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "profiles_total" INTEGER NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "cutoff_date" TIMESTAMP(3) NOT NULL,
    "total_cost" DECIMAL(12,4) NOT NULL,
    "notes" TEXT,
    "status" "StreamingAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaming_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_profiles" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "profile_no" INTEGER NOT NULL,
    "status" "AccountProfileStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaming_sales" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "sale_price" DECIMAL(12,4) NOT NULL,
    "sale_date" TIMESTAMP(3) NOT NULL,
    "days_assigned" INTEGER NOT NULL,
    "cutoff_date" TIMESTAMP(3) NOT NULL,
    "cost_at_sale" DECIMAL(12,4) NOT NULL,
    "notes" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaming_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_items" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PROFILE',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(12,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kardex_movements" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "type" "KardexType" NOT NULL,
    "ref_type" "KardexRefType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,4) NOT NULL,
    "total_cost" DECIMAL(12,4) NOT NULL,
    "stock_after" INTEGER NOT NULL,
    "avg_cost_after" DECIMAL(12,4) NOT NULL,
    "account_id" INTEGER,
    "sale_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kardex_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "streaming_platforms_name_key" ON "streaming_platforms"("name");

-- CreateIndex
CREATE INDEX "streaming_accounts_company_id_idx" ON "streaming_accounts"("company_id");

-- CreateIndex
CREATE INDEX "streaming_accounts_platform_id_idx" ON "streaming_accounts"("platform_id");

-- CreateIndex
CREATE INDEX "streaming_accounts_supplier_id_idx" ON "streaming_accounts"("supplier_id");

-- CreateIndex
CREATE INDEX "streaming_accounts_status_idx" ON "streaming_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "streaming_accounts_company_id_platform_id_email_key" ON "streaming_accounts"("company_id", "platform_id", "email");

-- CreateIndex
CREATE INDEX "account_profiles_account_id_idx" ON "account_profiles"("account_id");

-- CreateIndex
CREATE INDEX "account_profiles_status_idx" ON "account_profiles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "account_profiles_account_id_profile_no_key" ON "account_profiles"("account_id", "profile_no");

-- CreateIndex
CREATE INDEX "streaming_sales_company_id_idx" ON "streaming_sales"("company_id");

-- CreateIndex
CREATE INDEX "streaming_sales_platform_id_idx" ON "streaming_sales"("platform_id");

-- CreateIndex
CREATE INDEX "streaming_sales_account_id_idx" ON "streaming_sales"("account_id");

-- CreateIndex
CREATE INDEX "streaming_sales_profile_id_idx" ON "streaming_sales"("profile_id");

-- CreateIndex
CREATE INDEX "streaming_sales_customer_id_idx" ON "streaming_sales"("customer_id");

-- CreateIndex
CREATE INDEX "streaming_sales_cutoff_date_idx" ON "streaming_sales"("cutoff_date");

-- CreateIndex
CREATE INDEX "streaming_sales_status_idx" ON "streaming_sales"("status");

-- CreateIndex
CREATE INDEX "cost_items_company_id_idx" ON "cost_items"("company_id");

-- CreateIndex
CREATE INDEX "cost_items_platform_id_idx" ON "cost_items"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_items_company_id_platform_id_key" ON "cost_items"("company_id", "platform_id");

-- CreateIndex
CREATE INDEX "kardex_movements_company_id_idx" ON "kardex_movements"("company_id");

-- CreateIndex
CREATE INDEX "kardex_movements_item_id_idx" ON "kardex_movements"("item_id");

-- CreateIndex
CREATE INDEX "kardex_movements_type_idx" ON "kardex_movements"("type");

-- CreateIndex
CREATE INDEX "kardex_movements_ref_type_idx" ON "kardex_movements"("ref_type");

-- CreateIndex
CREATE INDEX "kardex_movements_account_id_idx" ON "kardex_movements"("account_id");

-- CreateIndex
CREATE INDEX "kardex_movements_sale_id_idx" ON "kardex_movements"("sale_id");

-- AddForeignKey
ALTER TABLE "streaming_accounts" ADD CONSTRAINT "streaming_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_accounts" ADD CONSTRAINT "streaming_accounts_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "streaming_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_accounts" ADD CONSTRAINT "streaming_accounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_profiles" ADD CONSTRAINT "account_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "streaming_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_sales" ADD CONSTRAINT "streaming_sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_sales" ADD CONSTRAINT "streaming_sales_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "streaming_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_sales" ADD CONSTRAINT "streaming_sales_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "streaming_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_sales" ADD CONSTRAINT "streaming_sales_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "account_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_sales" ADD CONSTRAINT "streaming_sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "streaming_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "cost_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "streaming_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kardex_movements" ADD CONSTRAINT "kardex_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "streaming_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
