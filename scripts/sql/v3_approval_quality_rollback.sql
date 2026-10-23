-- Rollback YC-10 Phase 2 (local test only).
-- Chi drop dung pham vi migration 20261023180000_v3_approval_quality.
DROP TABLE IF EXISTS "approval_quality_adjustments";

ALTER TABLE "approval_decisions"
  DROP CONSTRAINT IF EXISTS "approval_decisions_quality_percent_check";

ALTER TABLE "approval_decisions"
  DROP COLUMN IF EXISTS "quality_percent";
