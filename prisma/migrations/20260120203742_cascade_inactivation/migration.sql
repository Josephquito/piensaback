-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cascade_inactivated_by_user_id" INTEGER;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cascade_inactivated_by_user_id_fkey" FOREIGN KEY ("cascade_inactivated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
