-- YC-38C — LIÊN THÔNG DỮ LIỆU CÔNG VIỆC (additive, tương thích ngược)
--
-- Nguyên tắc an toàn:
--   * KHÔNG DROP / TRUNCATE / DELETE / UPDATE dữ liệu nghiệp vụ.
--   * Mọi câu lệnh CREATE dùng IF NOT EXISTS → chạy lại nhiều lần vẫn an toàn.
--   * Cột mới đều NULL (hoặc DEFAULT) → dữ liệu cũ giữ nguyên, hệ thống cũ vẫn chạy.
--   * Production KHÔNG có bảng `_prisma_migrations` → áp dụng bằng
--     `npx tsx scripts/apply-yc38c-ddl.ts` (KHÔNG dùng `prisma migrate deploy`).
--
-- Nội dung:
--   1) work_item_series      — chuỗi công việc gốc xuyên nhiều kỳ (mã gốc ổn định)
--   2) work_item_assignments — bảng phân công (1 việc gốc, nhiều người; không nhân bản việc gốc)
--   3) work_item_products    — 1 việc gốc ↔ 0..n sản phẩm QĐ1277 (không cộng điểm, không trùng)
--   4) Cột provenance + đầu mối chủ trì trên personal_work_items
--   5) Cột liên kết trên tasks / plan_items
--   6) Chống ghi trùng trên monthly_work_results (idempotency_key)

-- ---------------------------------------------------------------------------
-- 1) CHUỖI CÔNG VIỆC GỐC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_item_series" (
    "id"           TEXT NOT NULL,
    "series_code"  TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "owner_type"   TEXT NOT NULL DEFAULT 'PERSON',
    "owner_id"     TEXT,
    "created_by_id" TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_item_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_item_series_series_code_key" ON "work_item_series"("series_code");

-- ---------------------------------------------------------------------------
-- 2) BẢNG PHÂN CÔNG — 1 công việc gốc, nhiều người tham gia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_item_assignments" (
    "id"                 TEXT NOT NULL,
    "work_item_id"       TEXT NOT NULL,
    "person_id"          TEXT NOT NULL,
    "period_id"          TEXT NOT NULL,
    "role"               TEXT NOT NULL DEFAULT 'COLLABORATOR',
    "status"             TEXT NOT NULL DEFAULT 'ASSIGNED',
    "progress_percent"   INTEGER NOT NULL DEFAULT 0,
    "completed_date"     DATE,
    "actual_result_text" TEXT,
    "note"               TEXT,
    "assigned_by_id"     TEXT,
    "assigned_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at"       TIMESTAMP(3),
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_item_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_item_assignments_work_item_id_person_id_period_id_key"
    ON "work_item_assignments"("work_item_id", "person_id", "period_id");
CREATE INDEX IF NOT EXISTS "work_item_assignments_person_id_period_id_idx"
    ON "work_item_assignments"("person_id", "period_id");

-- ---------------------------------------------------------------------------
-- 3) LIÊN KẾT 0..n SẢN PHẨM QĐ1277
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_item_products" (
    "id"             TEXT NOT NULL,
    "work_item_id"   TEXT NOT NULL,
    "product_item_id" TEXT NOT NULL,
    "quantity"       DOUBLE PRECISION,
    "is_primary"     BOOLEAN NOT NULL DEFAULT false,
    "note"           TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_item_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_item_products_work_item_id_product_item_id_key"
    ON "work_item_products"("work_item_id", "product_item_id");
CREATE INDEX IF NOT EXISTS "work_item_products_product_item_id_idx"
    ON "work_item_products"("product_item_id");

-- ---------------------------------------------------------------------------
-- 4) CỘT MỚI TRÊN personal_work_items
-- ---------------------------------------------------------------------------
ALTER TABLE "personal_work_items" ADD COLUMN IF NOT EXISTS "primary_owner_person_id" TEXT;
ALTER TABLE "personal_work_items" ADD COLUMN IF NOT EXISTS "primary_owner_unit_id" TEXT;
ALTER TABLE "personal_work_items" ADD COLUMN IF NOT EXISTS "source_kind" TEXT;
ALTER TABLE "personal_work_items" ADD COLUMN IF NOT EXISTS "source_ref_id" TEXT;
ALTER TABLE "personal_work_items" ADD COLUMN IF NOT EXISTS "source_code_snapshot" TEXT;
ALTER TABLE "personal_work_items" ADD COLUMN IF NOT EXISTS "series_id" TEXT;
ALTER TABLE "personal_work_items" ADD COLUMN IF NOT EXISTS "line_no" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "personal_work_items_primary_owner_person_id_idx"
    ON "personal_work_items"("primary_owner_person_id");
CREATE INDEX IF NOT EXISTS "personal_work_items_series_id_idx"
    ON "personal_work_items"("series_id");

-- ---------------------------------------------------------------------------
-- 5) CỘT MỚI TRÊN tasks / plan_items
-- ---------------------------------------------------------------------------
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "work_item_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assigned_by_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source_kind" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source_ref_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source_code_snapshot" TEXT;

CREATE INDEX IF NOT EXISTS "tasks_work_item_id_idx" ON "tasks"("work_item_id");

ALTER TABLE "plan_items" ADD COLUMN IF NOT EXISTS "work_item_id" TEXT;
CREATE INDEX IF NOT EXISTS "plan_items_work_item_id_idx" ON "plan_items"("work_item_id");

-- ---------------------------------------------------------------------------
-- 6) CHỐNG GHI TRÙNG TRÊN monthly_work_results
--    PostgreSQL 17 (NULLS DISTINCT) → nhiều bản ghi cũ có NULL vẫn hợp lệ.
-- ---------------------------------------------------------------------------
ALTER TABLE "monthly_work_results" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "monthly_work_results" ADD COLUMN IF NOT EXISTS "subject_kind" TEXT;
ALTER TABLE "monthly_work_results" ADD COLUMN IF NOT EXISTS "subject_id" TEXT;
ALTER TABLE "monthly_work_results" ADD COLUMN IF NOT EXISTS "line_no" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS "monthly_work_results_idempotency_key_key"
    ON "monthly_work_results"("idempotency_key");

-- ---------------------------------------------------------------------------
-- 7) KHÓA NGOẠI (thêm sau cùng, khi dữ liệu mới đã có cột)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_work_items_primary_owner_person_id_fkey') THEN
        ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_primary_owner_person_id_fkey"
            FOREIGN KEY ("primary_owner_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_work_items_primary_owner_unit_id_fkey') THEN
        ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_primary_owner_unit_id_fkey"
            FOREIGN KEY ("primary_owner_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_work_items_series_id_fkey') THEN
        ALTER TABLE "personal_work_items" ADD CONSTRAINT "personal_work_items_series_id_fkey"
            FOREIGN KEY ("series_id") REFERENCES "work_item_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_work_item_id_fkey') THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_work_item_id_fkey"
            FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_created_by_id_fkey') THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey"
            FOREIGN KEY ("created_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assigned_by_id_fkey') THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_id_fkey"
            FOREIGN KEY ("assigned_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_items_work_item_id_fkey') THEN
        ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_work_item_id_fkey"
            FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_item_assignments_work_item_id_fkey') THEN
        ALTER TABLE "work_item_assignments" ADD CONSTRAINT "work_item_assignments_work_item_id_fkey"
            FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_item_assignments_person_id_fkey') THEN
        ALTER TABLE "work_item_assignments" ADD CONSTRAINT "work_item_assignments_person_id_fkey"
            FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_item_assignments_period_id_fkey') THEN
        ALTER TABLE "work_item_assignments" ADD CONSTRAINT "work_item_assignments_period_id_fkey"
            FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_item_assignments_assigned_by_id_fkey') THEN
        ALTER TABLE "work_item_assignments" ADD CONSTRAINT "work_item_assignments_assigned_by_id_fkey"
            FOREIGN KEY ("assigned_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_item_products_work_item_id_fkey') THEN
        ALTER TABLE "work_item_products" ADD CONSTRAINT "work_item_products_work_item_id_fkey"
            FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_item_products_product_item_id_fkey') THEN
        ALTER TABLE "work_item_products" ADD CONSTRAINT "work_item_products_product_item_id_fkey"
            FOREIGN KEY ("product_item_id") REFERENCES "product_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_item_series_created_by_id_fkey') THEN
        ALTER TABLE "work_item_series" ADD CONSTRAINT "work_item_series_created_by_id_fkey"
            FOREIGN KEY ("created_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
