-- V3 Phase B — B-C-2/Q9: phân biệt dữ liệu THẬT (REAL) và MÔ PHỎNG (DEMO) bằng cờ dữ liệu.
-- Additive; backfill một lần từ dữ liệu cũ; logic ứng dụng KHÔNG dò nhãn [DEMO] nữa.
-- Không chạy trên Production trong Phase B.

-- 1. Thêm cột cờ dữ liệu (mặc định REAL để không đổi nghĩa dữ liệu hiện hữu).
ALTER TABLE "metric_plan_targets"
  ADD COLUMN IF NOT EXISTS "data_source" TEXT NOT NULL DEFAULT 'REAL';
ALTER TABLE "metric_baselines"
  ADD COLUMN IF NOT EXISTS "data_source" TEXT NOT NULL DEFAULT 'REAL';
ALTER TABLE "metric_daily_entries"
  ADD COLUMN IF NOT EXISTS "data_source" TEXT NOT NULL DEFAULT 'REAL';

-- 2. Backfill một lần — chỉ dùng nhãn/nguồn cũ để phân loại dữ liệu lịch sử.
--    Sau bước này, mọi logic nghiệp vụ đọc data_source, không đọc nhãn.
UPDATE "metric_plan_targets"
SET "data_source" = 'DEMO'
WHERE "label" LIKE '%[DEMO%';

UPDATE "metric_baselines" AS b
SET "data_source" = 'DEMO'
WHERE COALESCE(b."source_note", '') LIKE '%[DEMO%'
   OR EXISTS (
     SELECT 1 FROM "people" p
     WHERE p."id" IN (b."proposed_by_id", b."confirmed_by_id")
       AND UPPER(p."code") LIKE 'DEMO%'
   );

UPDATE "metric_daily_entries" AS e
SET "data_source" = 'DEMO'
WHERE COALESCE(e."note", '') LIKE '%[DEMO%'
   OR EXISTS (
     SELECT 1 FROM "people" p
     WHERE p."id" = e."entered_by_id"
       AND UPPER(p."code") LIKE 'DEMO%'
   );

-- 3. Ràng buộc giá trị hợp lệ (additive, có thể chạy lặp).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metric_plan_targets_data_source_check') THEN
    ALTER TABLE "metric_plan_targets"
      ADD CONSTRAINT "metric_plan_targets_data_source_check" CHECK ("data_source" IN ('REAL', 'DEMO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metric_baselines_data_source_check') THEN
    ALTER TABLE "metric_baselines"
      ADD CONSTRAINT "metric_baselines_data_source_check" CHECK ("data_source" IN ('REAL', 'DEMO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metric_daily_entries_data_source_check') THEN
    ALTER TABLE "metric_daily_entries"
      ADD CONSTRAINT "metric_daily_entries_data_source_check" CHECK ("data_source" IN ('REAL', 'DEMO'));
  END IF;
END $$;

-- 4. Audit/backup: ghi lại số bản ghi đã phân loại DEMO để truy vết và rollback logic.
INSERT INTO "audit_events" ("id", "actor_id", "action", "resource_type", "resource_id", "old_data", "new_data", "timestamp")
SELECT
  gen_random_uuid()::text,
  NULL,
  'MIGRATION_BACKFILL_METRIC_DATA_SOURCE',
  'Migration',
  '20261023160000_v3_phase_b_data_source',
  NULL,
  jsonb_build_object(
    'demoTargets', (SELECT COUNT(*) FROM "metric_plan_targets" WHERE "data_source" = 'DEMO'),
    'demoBaselines', (SELECT COUNT(*) FROM "metric_baselines" WHERE "data_source" = 'DEMO'),
    'demoEntries', (SELECT COUNT(*) FROM "metric_daily_entries" WHERE "data_source" = 'DEMO'),
    'realTargets', (SELECT COUNT(*) FROM "metric_plan_targets" WHERE "data_source" = 'REAL'),
    'realBaselines', (SELECT COUNT(*) FROM "metric_baselines" WHERE "data_source" = 'REAL'),
    'realEntries', (SELECT COUNT(*) FROM "metric_daily_entries" WHERE "data_source" = 'REAL')
  ),
  CURRENT_TIMESTAMP;
