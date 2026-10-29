-- Số lượng giao/hoàn thành gắn với nhiệm vụ
ALTER TABLE "tasks"
  ADD COLUMN "assigned_qty" DOUBLE PRECISION,
  ADD COLUMN "completed_qty" DOUBLE PRECISION,
  ADD COLUMN "quantity_unit" TEXT,
  ADD COLUMN "factor_snapshot" DOUBLE PRECISION,
  ADD COLUMN "completed_date" DATE;

-- Chi tiết 10 tiêu chí chung + d/đ/e của lãnh đạo
ALTER TABLE "evaluation_assessments"
  ADD COLUMN "common_criteria_detail" JSONB,
  ADD COLUMN "leader_d" DOUBLE PRECISION,
  ADD COLUMN "leader_dd" DOUBLE PRECISION,
  ADD COLUMN "leader_e" DOUBLE PRECISION;
