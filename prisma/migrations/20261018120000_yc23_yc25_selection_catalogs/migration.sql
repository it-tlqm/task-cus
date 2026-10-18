-- YC-23 + YC-25 - Danh mục lựa chọn đầu việc kế hoạch cá nhân (additive, không đổi dữ liệu hiện có):
--   (1) department_work_items: danh mục đầu việc riêng theo bộ phận (YC-25, tách biệt 48 mẫu thường xuyên và danh mục sản phẩm QĐ1277)
--   (2) personal_work_items.dept_work_item_id: liên kết đầu việc chọn từ danh mục bộ phận (ON DELETE SET NULL)
--   (3) personal_work_items.product_item_id: liên kết sản phẩm đầu ra theo QĐ1277 khi lập kế hoạch (YC-23, tuỳ chọn)
--   (4) monthly_work_results.work_item_id: liên kết đầu việc thực tế khi ghi nhận kết quả (chống ghi nhận trùng)
-- An toàn: mọi cột mới đều NULLABLE; không sửa/xoá cột cũ; rollback: prisma/migrations/20261018120000_yc23_yc25_selection_catalogs/rollback.sql

-- AlterTable
ALTER TABLE "monthly_work_results" ADD COLUMN     "work_item_id" TEXT;

-- AlterTable
ALTER TABLE "personal_work_items" ADD COLUMN     "dept_work_item_id" TEXT,
ADD COLUMN     "product_item_id" TEXT;

-- CreateTable
CREATE TABLE "department_work_items" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_work_items_unit_id_status_idx" ON "department_work_items"("unit_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "department_work_items_unit_id_title_key" ON "department_work_items"("unit_id", "title");

-- AddForeignKey
ALTER TABLE "department_work_items" ADD CONSTRAINT "department_work_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "org_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_work_items" ADD CONSTRAINT "department_work_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_dept_work_item_id_fkey" FOREIGN KEY ("dept_work_item_id") REFERENCES "department_work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_product_item_id_fkey" FOREIGN KEY ("product_item_id") REFERENCES "product_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_work_results" ADD CONSTRAINT "monthly_work_results_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
