-- V3.2 (S2/S3) - D5-A / C1-A metrics decisions (additive, local rehearsal only).
-- Khong doi du lieu cu; khong seed target/baseline/entry.
-- Chi tao bang quy tac danh gia/gan chi tieu tuong minh:
--   D5: direction / measure_mode / baseline_scope (khong suy tu ten/valueKind).
--   C1: chi THU_NSNN duoc gan chi tieu; 5 chi tieu luy ke/so du la NOT_SET/PENDING.
-- Moi dong duoi day la quyet dinh nghiep vu da duyet, khong phai default cho 49 chi tieu.

-- CreateTable
CREATE TABLE "metric_target_rules" (
    "id" TEXT NOT NULL,
    "metric_id" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "target_applicable" BOOLEAN NOT NULL,
    "direction" TEXT NOT NULL,
    "measure_mode" TEXT NOT NULL,
    "baseline_scope" TEXT NOT NULL,
    "source_note" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_target_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "metric_target_rules"
  ADD CONSTRAINT "metric_target_rules_period_type_check"
    CHECK ("period_type" IN ('YEAR','QUARTER','MONTH')),
  ADD CONSTRAINT "metric_target_rules_direction_check"
    CHECK ("direction" IN ('HIGHER_IS_BETTER','LOWER_IS_BETTER','NEUTRAL','NOT_SET')),
  ADD CONSTRAINT "metric_target_rules_measure_mode_check"
    CHECK ("measure_mode" IN ('PERIOD_FLOW','CUMULATIVE','SNAPSHOT','DERIVED','PENDING_BUSINESS_INPUT')),
  ADD CONSTRAINT "metric_target_rules_baseline_scope_check"
    CHECK ("baseline_scope" IN ('YEAR_START','MONTH_START','PERIOD_START','PENDING_BUSINESS_INPUT'));

-- CreateIndex
CREATE UNIQUE INDEX "metric_target_rules_metric_id_period_type_key"
  ON "metric_target_rules"("metric_id", "period_type");
CREATE INDEX "metric_target_rules_target_applicable_idx"
  ON "metric_target_rules"("target_applicable");

-- AddForeignKey
ALTER TABLE "metric_target_rules"
  ADD CONSTRAINT "metric_target_rules_metric_id_fkey"
  FOREIGN KEY ("metric_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D5-A/C1-A: CHI THU_NSNN duoc gan chi tieu (nam + thang).
INSERT INTO "metric_target_rules"
  ("id","metric_id","period_type","target_applicable","direction","measure_mode","baseline_scope","source_note","approved_at","note","created_at","updated_at")
SELECT
  gen_random_uuid()::text,
  m."id",
  v.period_type,
  v.target_applicable,
  v.direction,
  v.measure_mode,
  v.baseline_scope,
  v.source_note,
  CURRENT_TIMESTAMP,
  v.note,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "metric_definitions" m
JOIN (VALUES
  ('THU_NSNN','YEAR', true,  'HIGHER_IS_BETTER','CUMULATIVE','YEAR_START',
   'V3.2 D5-A/C1-A: THU_NSNN - chi tieu nam, luy ke tu dau nam', 'Chi THU_NSNN duoc gan chi tieu nam.'),
  ('THU_NSNN','MONTH', true, 'HIGHER_IS_BETTER','CUMULATIVE','MONTH_START',
   'V3.2 D5-A/C1-A: THU_NSNN - chi tieu thang, luy ke tu dau thang', 'Chi THU_NSNN duoc gan chi tieu thang.'),
  ('PHI_LK_THU','YEAR', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: PHI_LK_THU chua co quy tac luy ke - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('PHI_LK_THU','QUARTER', false, 'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: PHI_LK_THU chua co quy tac luy ke - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('PHI_LK_THU','MONTH', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: PHI_LK_THU chua co quy tac luy ke - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('PHI_CON','YEAR', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: PHI_CON chua co quy tac con phai thu - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('PHI_CON','QUARTER', false, 'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: PHI_CON chua co quy tac con phai thu - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('PHI_CON','MONTH', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: PHI_CON chua co quy tac con phai thu - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('XOA_NO','YEAR', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: XOA_NO chua co quy tac luy ke - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('XOA_NO','QUARTER', false, 'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: XOA_NO chua co quy tac luy ke - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('XOA_NO','MONTH', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: XOA_NO chua co quy tac luy ke - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('NO_THUE','YEAR', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: NO_THUE la so du - chua co quy tac - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('NO_THUE','QUARTER', false, 'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: NO_THUE la so du - chua co quy tac - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('NO_THUE','MONTH', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: NO_THUE la so du - chua co quy tac - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('TV_CHO','YEAR', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: TV_CHO la so du - chua co quy tac - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('TV_CHO','QUARTER', false, 'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: TV_CHO la so du - chua co quy tac - khong tinh % chinh thuc', 'Khong gan chi tieu.'),
  ('TV_CHO','MONTH', false,  'NOT_SET','PENDING_BUSINESS_INPUT','PENDING_BUSINESS_INPUT',
   'V3.2 D5-A: TV_CHO la so du - chua co quy tac - khong tinh % chinh thuc', 'Khong gan chi tieu.')
) AS v(code, period_type, target_applicable, direction, measure_mode, baseline_scope, source_note, note)
  ON v.code = m."code"
ON CONFLICT ("metric_id", "period_type") DO NOTHING;
