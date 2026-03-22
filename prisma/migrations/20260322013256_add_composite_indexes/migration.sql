-- CreateIndex
CREATE INDEX "account_profiles_account_id_status_idx" ON "account_profiles"("account_id", "status");

-- CreateIndex
CREATE INDEX "kardex_movements_company_id_item_id_idx" ON "kardex_movements"("company_id", "item_id");

-- CreateIndex
CREATE INDEX "streaming_accounts_company_id_status_idx" ON "streaming_accounts"("company_id", "status");

-- CreateIndex
CREATE INDEX "streaming_sales_company_id_status_idx" ON "streaming_sales"("company_id", "status");

-- CreateIndex
CREATE INDEX "streaming_sales_company_id_account_id_idx" ON "streaming_sales"("company_id", "account_id");

-- CreateIndex
CREATE INDEX "streaming_sales_company_id_customer_id_idx" ON "streaming_sales"("company_id", "customer_id");

-- CreateIndex
CREATE INDEX "streaming_sales_company_id_cutoff_date_idx" ON "streaming_sales"("company_id", "cutoff_date");
