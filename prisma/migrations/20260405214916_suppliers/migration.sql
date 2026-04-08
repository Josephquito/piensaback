-- CreateEnum
CREATE TYPE "SupplierMovementType" AS ENUM ('PURCHASE', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CREDIT', 'BALANCE', 'CASH_BALANCE', 'CASH_CREDIT', 'BALANCE_CREDIT');

-- CreateTable
CREATE TABLE "supplier_movements" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "type" "SupplierMovementType" NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "balance_before" DECIMAL(12,4) NOT NULL,
    "balance_after" DECIMAL(12,4) NOT NULL,
    "account_id" INTEGER,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_movements_company_id_idx" ON "supplier_movements"("company_id");

-- CreateIndex
CREATE INDEX "supplier_movements_supplier_id_idx" ON "supplier_movements"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_movements_account_id_idx" ON "supplier_movements"("account_id");

-- AddForeignKey
ALTER TABLE "supplier_movements" ADD CONSTRAINT "supplier_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_movements" ADD CONSTRAINT "supplier_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_movements" ADD CONSTRAINT "supplier_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "streaming_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
