-- YC-11/YC-12: danh muc san pham QĐ1277 + ket qua san pham thang (additive, khong cham du lieu cu)
CREATE TABLE "product_catalog_versions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source_file" TEXT NOT NULL,
  "source_sheet" TEXT NOT NULL,
  "qd_ref" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_catalog_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_catalog_versions_code_key" ON "product_catalog_versions"("code");

CREATE TABLE "product_groups" (
  "id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "product_catalog_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "product_items" (
  "id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "group_id" TEXT,
  "code" TEXT NOT NULL,
  "source_row" INTEGER NOT NULL,
  "source_stt" TEXT,
  "task_name" TEXT NOT NULL,
  "detail_work" TEXT,
  "output_product" TEXT,
  "group_name" TEXT,
  "max_score" DOUBLE PRECISION,
  "point_value" DOUBLE PRECISION,
  "convert_factor" DOUBLE PRECISION,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "product_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_items_code_key" ON "product_items"("code");
CREATE INDEX "product_items_version_id_group_id_idx" ON "product_items"("version_id", "group_id");
ALTER TABLE "product_items" ADD CONSTRAINT "product_items_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "product_catalog_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_items" ADD CONSTRAINT "product_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "monthly_work_results" (
  "id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "period_year" INTEGER NOT NULL,
  "period_month" INTEGER NOT NULL,
  "product_item_id" TEXT,
  "needs_review" BOOLEAN NOT NULL DEFAULT false,
  "task_id" TEXT,
  "title" TEXT NOT NULL,
  "output_text" TEXT,
  "assigned_qty" DOUBLE PRECISION,
  "completed_qty" DOUBLE PRECISION,
  "due_date" TIMESTAMP(3),
  "completed_date" TIMESTAMP(3),
  "evidence_ref" TEXT,
  "factor_snapshot" DOUBLE PRECISION,
  "late_count" INTEGER NOT NULL DEFAULT 0,
  "rework_count" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monthly_work_results_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "monthly_work_results_person_id_period_year_period_month_idx" ON "monthly_work_results"("person_id", "period_year", "period_month");
ALTER TABLE "monthly_work_results" ADD CONSTRAINT "monthly_work_results_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_work_results" ADD CONSTRAINT "monthly_work_results_product_item_id_fkey" FOREIGN KEY ("product_item_id") REFERENCES "product_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
