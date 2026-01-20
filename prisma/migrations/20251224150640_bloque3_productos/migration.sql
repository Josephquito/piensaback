-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AccountSlotStatus" AS ENUM ('AVAILABLE', 'SOLD', 'BLOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "SlotSaleStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    "email_login" TEXT NOT NULL,
    "password_login" TEXT NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "cut_off_at" TIMESTAMP(3) NOT NULL,
    "profiles_count" INTEGER NOT NULL,
    "purchase_total_cost" DECIMAL(12,2) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_slots" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "AccountSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_sales" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "sale_price" DECIMAL(12,2) NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "cut_off_at" TIMESTAMP(3) NOT NULL,
    "cogs_cost" DECIMAL(12,2) NOT NULL,
    "status" "SlotSaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "sold_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,4) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "account_id" INTEGER,
    "slot_sale_id" INTEGER,
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_inventory_balances" (
    "company_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty_on_hand" INTEGER NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_inventory_balances_pkey" PRIMARY KEY ("company_id","product_id")
);

-- CreateIndex
CREATE INDEX "accounts_company_id_product_id_idx" ON "accounts"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_company_id_product_id_email_login_key" ON "accounts"("company_id", "product_id", "email_login");

-- CreateIndex
CREATE INDEX "account_slots_account_id_status_idx" ON "account_slots"("account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "account_slots_account_id_code_key" ON "account_slots"("account_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "slot_sales_slot_id_key" ON "slot_sales"("slot_id");

-- CreateIndex
CREATE INDEX "slot_sales_company_id_product_id_status_idx" ON "slot_sales"("company_id", "product_id", "status");

-- CreateIndex
CREATE INDEX "slot_sales_company_id_customer_id_status_idx" ON "slot_sales"("company_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "inventory_movements_company_id_product_id_created_at_idx" ON "inventory_movements"("company_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_account_id_idx" ON "inventory_movements"("account_id");

-- CreateIndex
CREATE INDEX "inventory_movements_slot_sale_id_idx" ON "inventory_movements"("slot_sale_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_slots" ADD CONSTRAINT "account_slots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_slots" ADD CONSTRAINT "account_slots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_sales" ADD CONSTRAINT "slot_sales_sold_by_user_id_fkey" FOREIGN KEY ("sold_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_sales" ADD CONSTRAINT "slot_sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_sales" ADD CONSTRAINT "slot_sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_sales" ADD CONSTRAINT "slot_sales_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_sales" ADD CONSTRAINT "slot_sales_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "account_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_sales" ADD CONSTRAINT "slot_sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_slot_sale_id_fkey" FOREIGN KEY ("slot_sale_id") REFERENCES "slot_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inventory_balances" ADD CONSTRAINT "product_inventory_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inventory_balances" ADD CONSTRAINT "product_inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
