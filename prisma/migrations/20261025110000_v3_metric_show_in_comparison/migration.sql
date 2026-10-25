-- V3.2 — cấu hình chỉ tiêu hiển thị trong khối So sánh kết quả thu NSNN.
-- Additive: mặc định ẩn; bật THU_NSNN; các chỉ tiêu khác bật sau qua UI.
ALTER TABLE "metric_definitions"
  ADD COLUMN IF NOT EXISTS "show_in_comparison" BOOLEAN NOT NULL DEFAULT false;

UPDATE "metric_definitions"
SET "show_in_comparison" = true
WHERE UPPER("code") = 'THU_NSNN';
