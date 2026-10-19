-- AlterTable
ALTER TABLE "personal_work_items" ADD COLUMN     "catalog_entry_id" TEXT,
ADD COLUMN     "completed_date" DATE,
ADD COLUMN     "due_date" DATE,
ADD COLUMN     "task_id" TEXT;

-- CreateTable
CREATE TABLE "work_catalog_versions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Danh mục công việc thường xuyên',
    "source_file_name" TEXT,
    "source_sheet" TEXT,
    "entry_count" INTEGER NOT NULL,
    "import_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "imported_by_id" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_catalog_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_catalog_entries" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "department_order" INTEGER NOT NULL DEFAULT 0,
    "unit_id" TEXT,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_row" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_evidences" (
    "id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "monthly_result_id" TEXT,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_url" TEXT,
    "checksum" TEXT,
    "note" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_catalog_versions_code_key" ON "work_catalog_versions"("code");

-- CreateIndex
CREATE INDEX "work_catalog_versions_status_imported_at_idx" ON "work_catalog_versions"("status", "imported_at");

-- CreateIndex
CREATE INDEX "work_catalog_entries_version_id_status_department_order_sor_idx" ON "work_catalog_entries"("version_id", "status", "department_order", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "work_catalog_entries_version_id_department_title_key" ON "work_catalog_entries"("version_id", "department", "title");

-- CreateIndex
CREATE UNIQUE INDEX "work_catalog_entries_version_id_code_key" ON "work_catalog_entries"("version_id", "code");

-- CreateIndex
CREATE INDEX "work_evidences_work_item_id_created_at_idx" ON "work_evidences"("work_item_id", "created_at");

-- CreateIndex
CREATE INDEX "work_evidences_monthly_result_id_idx" ON "work_evidences"("monthly_result_id");

-- CreateIndex
CREATE INDEX "personal_work_items_catalog_entry_id_idx" ON "personal_work_items"("catalog_entry_id");

-- CreateIndex
CREATE INDEX "personal_work_items_task_id_idx" ON "personal_work_items"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_work_results_person_id_work_item_id_key" ON "monthly_work_results"("person_id", "work_item_id");

-- AddForeignKey
ALTER TABLE "work_catalog_versions" ADD CONSTRAINT "work_catalog_versions_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_catalog_entries" ADD CONSTRAINT "work_catalog_entries_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "work_catalog_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_catalog_entries" ADD CONSTRAINT "work_catalog_entries_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_evidences" ADD CONSTRAINT "work_evidences_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_evidences" ADD CONSTRAINT "work_evidences_monthly_result_id_fkey" FOREIGN KEY ("monthly_result_id") REFERENCES "monthly_work_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_evidences" ADD CONSTRAINT "work_evidences_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_catalog_entry_id_fkey" FOREIGN KEY ("catalog_entry_id") REFERENCES "work_catalog_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

