-- V3 Phase B (YC-01/02) — hợp đồng dữ liệu B/C phiên bản B-C-1.
-- Additive only: không xóa/đổi cột cũ, không suy đoán comparison_kind từ nhãn.
-- Chỉ rehearsal trên DB kiểm thử; KHÔNG chạy migration này trên Production trong Phase B.

-- 1. Chỉ tiêu giao: nguồn/căn cứ, trạng thái nhập/xác nhận/chốt, loại đối chiếu tường minh.
ALTER TABLE "metric_plan_targets"
  ADD COLUMN IF NOT EXISTS "comparison_kind" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "source_note" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  ADD COLUMN IF NOT EXISTS "proposed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "locked_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);

-- 2. Mốc lũy kế: bổ sung trạng thái chốt (status PROPOSED/CONFIRMED đã có từ trước).
ALTER TABLE "metric_baselines"
  ADD COLUMN IF NOT EXISTS "locked_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);

-- 3. Lịch sử chỉ tiêu giao.
CREATE TABLE IF NOT EXISTS "metric_plan_target_revisions" (
  "id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "old_value" DECIMAL(24,4),
  "new_value" DECIMAL(24,4),
  "old_status" TEXT,
  "new_status" TEXT,
  "old_source_note" TEXT,
  "new_source_note" TEXT,
  "reason" TEXT,
  "edited_by_id" TEXT NOT NULL,
  "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_plan_target_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "metric_plan_target_revisions_target_id_edited_at_idx"
  ON "metric_plan_target_revisions"("target_id", "edited_at");

-- Lịch sử không dùng FK cascade để còn lại kể cả khi bản ghi nguồn bị xóa.
ALTER TABLE "metric_plan_target_revisions"
  DROP CONSTRAINT IF EXISTS "metric_plan_target_revisions_target_id_fkey";

-- 4. Lịch sử mốc lũy kế.
CREATE TABLE IF NOT EXISTS "metric_baseline_revisions" (
  "id" TEXT NOT NULL,
  "baseline_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "old_value" DECIMAL(24,4),
  "new_value" DECIMAL(24,4),
  "old_status" TEXT,
  "new_status" TEXT,
  "old_source_note" TEXT,
  "new_source_note" TEXT,
  "reason" TEXT,
  "edited_by_id" TEXT NOT NULL,
  "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_baseline_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "metric_baseline_revisions_baseline_id_edited_at_idx"
  ON "metric_baseline_revisions"("baseline_id", "edited_at");

-- Lịch sử không dùng FK cascade để còn lại kể cả khi bản ghi nguồn bị xóa.
ALTER TABLE "metric_baseline_revisions"
  DROP CONSTRAINT IF EXISTS "metric_baseline_revisions_baseline_id_fkey";

-- 5. Quyền nghiệp vụ riêng — KHÔNG dùng system.config, KHÔNG cấp mặc định cho SYSTEM_ADMIN.
INSERT INTO "permissions" ("id", "code", "name", "module", "created_at")
SELECT gen_random_uuid()::text, 'metrics.config', 'Cấu hình số liệu giao ban', 'METRICS', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'metrics.config');

INSERT INTO "permissions" ("id", "code", "name", "module", "created_at")
SELECT gen_random_uuid()::text, 'metrics.entry_all', 'Nhập số liệu giao ban toàn bộ', 'METRICS', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'metrics.entry_all');

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('metrics.config', 'metrics.entry_all')
WHERE r."code" = 'UNIT_LEADER'
ON CONFLICT DO NOTHING;
