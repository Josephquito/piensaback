-- CreateEnum
CREATE TYPE "BaseRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CompanyUserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "PermissionResource" AS ENUM ('USERS', 'PERMISSIONS', 'COMPANIES', 'SUPPLIERS', 'CUSTOMERS', 'STREAMING_PLATFORMS', 'STREAMING_ACCOUNTS', 'STREAMING_SALES', 'KARDEX');

-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "StreamingAccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "AccountProfileStatus" AS ENUM ('AVAILABLE', 'SOLD', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RenewalMessageStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'SENT');

-- CreateEnum
CREATE TYPE "KardexType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- CreateEnum
CREATE TYPE "KardexRefType" AS ENUM ('ACCOUNT_PURCHASE', 'PROFILE_SALE', 'ACCOUNT_INACTIVATION', 'PROFILE_ADJUST', 'ACCOUNT_RENEWAL', 'ACCOUNT_REPLACEMENT', 'COST_CORRECTION', 'PROFILE_TRANSFER', 'MANUAL_ADJUST');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "base_role" "BaseRole" NOT NULL DEFAULT 'EMPLOYEE',
    "created_by_user_id" INTEGER,
    "cascade_inactivated_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "CompanyUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT,
    "label" TEXT,
    "order" INTEGER,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission_id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "notes" TEXT,
    "balance" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "source" "CustomerSource",
    "source_note" TEXT,
    "notes" TEXT,
    "balance" TEXT,
    "last_purchase_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaming_platforms" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
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
    "duration_days" INTEGER NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "cutoff_date" TIMESTAMP(3) NOT NULL,
    "total_cost" DECIMAL(12,4) NOT NULL,
    "notes" TEXT,
    "status" "StreamingAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "replaced_by_email" TEXT,
    "replaced_at" TIMESTAMP(3),
    "replacement_note" TEXT,
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
    "daily_cost" DECIMAL(12,4) NOT NULL,
    "notes" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "renewal_status" "RenewalMessageStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "paused_at" TIMESTAMP(3),
    "paused_days_left" INTEGER,
    "credit_amount" DECIMAL(12,4),
    "credit_refunded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaming_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_items" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PROFILE_DAY',
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
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_created_by_user_id_idx" ON "users"("created_by_user_id");

-- CreateIndex
CREATE INDEX "users_base_role_idx" ON "users"("base_role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "companies_owner_user_id_idx" ON "companies"("owner_user_id");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "company_users_user_id_idx" ON "company_users"("user_id");

-- CreateIndex
CREATE INDEX "company_users_company_id_idx" ON "company_users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_company_id_user_id_key" ON "company_users"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "user_permissions_permission_id_idx" ON "user_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "suppliers_company_id_idx" ON "suppliers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_name_key" ON "suppliers"("company_id", "name");

-- CreateIndex
CREATE INDEX "customers_company_id_idx" ON "customers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_name_key" ON "customers"("company_id", "name");

-- CreateIndex
CREATE INDEX "streaming_platforms_company_id_idx" ON "streaming_platforms"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "streaming_platforms_company_id_name_key" ON "streaming_platforms"("company_id", "name");

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
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cascade_inactivated_by_user_id_fkey" FOREIGN KEY ("cascade_inactivated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaming_platforms" ADD CONSTRAINT "streaming_platforms_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
