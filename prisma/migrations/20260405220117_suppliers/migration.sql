-- AlterTable
ALTER TABLE "streaming_accounts" ADD COLUMN     "balance_amount" DECIMAL(12,4),
ADD COLUMN     "cash_amount" DECIMAL(12,4),
ADD COLUMN     "credit_amount" DECIMAL(12,4),
ADD COLUMN     "payment_mode" "PaymentMode" NOT NULL DEFAULT 'CASH';
