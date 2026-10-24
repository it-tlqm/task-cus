-- V3 UX Phase 2B1 — nhieu tag danh muc TX cho mot RoutineEntry + ngay/ca thuc te.
-- Additive, KHONG doi du lieu nghiep vu khac, KHONG dung cho Production trong task nay.
--
-- Backfill chi suy ra du lieu CO THE BIET:
--   work_date = ngay tao ban ghi theo lich Viet Nam (created_at luu UTC)
--   shift     = CA_NGAY (KHONG suy doan ca thuc te cua du lieu cu)
--   tag       = catalog_entry_id cu (neu co) thanh tag sort_order = 0
-- Cac cot moi deu NULLABLE; khong ep NOT NULL.

-- 1) Cot ngay/ca tren routine_entries
ALTER TABLE "routine_entries" ADD COLUMN IF NOT EXISTS "work_date" DATE;
ALTER TABLE "routine_entries" ADD COLUMN IF NOT EXISTS "shift" TEXT;

CREATE INDEX IF NOT EXISTS "routine_entries_work_date_idx"
  ON "routine_entries"("work_date");

-- 2) Bang tag N-N
CREATE TABLE IF NOT EXISTS "routine_entry_catalog_tags" (
    "id" TEXT NOT NULL,
    "routine_entry_id" TEXT NOT NULL,
    "catalog_entry_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_entry_catalog_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "routine_entry_catalog_tags_entry_catalog_key"
  ON "routine_entry_catalog_tags"("routine_entry_id", "catalog_entry_id");
CREATE INDEX IF NOT EXISTS "routine_entry_catalog_tags_routine_entry_id_idx"
  ON "routine_entry_catalog_tags"("routine_entry_id");
CREATE INDEX IF NOT EXISTS "routine_entry_catalog_tags_catalog_entry_id_idx"
  ON "routine_entry_catalog_tags"("catalog_entry_id");

ALTER TABLE "routine_entry_catalog_tags"
  ADD CONSTRAINT "routine_entry_catalog_tags_routine_entry_id_fkey"
  FOREIGN KEY ("routine_entry_id") REFERENCES "routine_entries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routine_entry_catalog_tags"
  ADD CONSTRAINT "routine_entry_catalog_tags_catalog_entry_id_fkey"
  FOREIGN KEY ("catalog_entry_id") REFERENCES "work_catalog_entries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Backfill ngay/ca cho du lieu cu
UPDATE "routine_entries"
SET "work_date" = (("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
WHERE "work_date" IS NULL;

UPDATE "routine_entries"
SET "shift" = 'CA_NGAY'
WHERE "shift" IS NULL;

-- 4) Backfill tag chinh tu catalog_entry_id cu (idempotent)
INSERT INTO "routine_entry_catalog_tags" (
  "id", "routine_entry_id", "catalog_entry_id", "sort_order", "created_at"
)
SELECT
  gen_random_uuid()::text,
  re."id",
  re."catalog_entry_id",
  0,
  re."created_at"
FROM "routine_entries" re
WHERE re."catalog_entry_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "routine_entry_catalog_tags" t
    WHERE t."routine_entry_id" = re."id"
      AND t."catalog_entry_id" = re."catalog_entry_id"
  );
