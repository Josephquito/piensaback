-- CreateTable
CREATE TABLE "account_renewals" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "cutoff_date" TIMESTAMP(3) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "total_cost" DECIMAL(12,4) NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "cash_amount" DECIMAL(12,4),
    "credit_amount" DECIMAL(12,4),
    "balance_amount" DECIMAL(12,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_renewals_company_id_idx" ON "account_renewals"("company_id");

-- CreateIndex
CREATE INDEX "account_renewals_account_id_idx" ON "account_renewals"("account_id");

-- AddForeignKey
ALTER TABLE "account_renewals" ADD CONSTRAINT "account_renewals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_renewals" ADD CONSTRAINT "account_renewals_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "streaming_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
