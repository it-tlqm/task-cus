-- AlterTable
ALTER TABLE "personal_work_items" ADD COLUMN "work_date" TIMESTAMP(3),
ADD COLUMN "date_text" TEXT,
ADD COLUMN "group_id" TEXT,
ADD COLUMN "coordination_unit" TEXT,
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'Trung bình',
ADD COLUMN "expected_result" TEXT;

-- AddForeignKey
ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "activity_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
