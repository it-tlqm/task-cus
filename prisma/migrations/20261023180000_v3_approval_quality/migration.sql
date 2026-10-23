-- YC-10 Phase 2 - chat luong ket qua Task (65..100, buoc 5) - additive.
-- Khong default/backfill; NULL = "chua danh gia".
-- Khong cham QD1277/monthly/scoring/ProductItem/WorkItemProduct/official grades.

-- AlterTable
ALTER TABLE "approval_decisions" ADD COLUMN "quality_percent" INTEGER;

ALTER TABLE "approval_decisions"
  ADD CONSTRAINT "approval_decisions_quality_percent_check"
  CHECK ("quality_percent" IS NULL OR ("quality_percent" BETWEEN 65 AND 100 AND "quality_percent" % 5 = 0));

-- CreateTable
CREATE TABLE "approval_quality_adjustments" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "old_quality_percent" INTEGER,
    "new_quality_percent" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "requested_by_account_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by_id" TEXT,
    "decided_by_account_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_quality_adjustments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_quality_adjustments"
  ADD CONSTRAINT "approval_quality_adjustments_old_quality_check"
  CHECK ("old_quality_percent" IS NULL OR ("old_quality_percent" BETWEEN 65 AND 100 AND "old_quality_percent" % 5 = 0)),
  ADD CONSTRAINT "approval_quality_adjustments_new_quality_check"
  CHECK ("new_quality_percent" BETWEEN 65 AND 100 AND "new_quality_percent" % 5 = 0),
  ADD CONSTRAINT "approval_quality_adjustments_status_check"
  CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
  ADD CONSTRAINT "approval_quality_adjustments_revision_check"
  CHECK ("revision" >= 1);

-- CreateIndex
CREATE UNIQUE INDEX "approval_quality_adjustments_decision_id_revision_key" ON "approval_quality_adjustments"("decision_id", "revision");
CREATE INDEX "approval_quality_adjustments_case_id_status_idx" ON "approval_quality_adjustments"("case_id", "status");
CREATE INDEX "approval_quality_adjustments_case_id_requested_at_idx" ON "approval_quality_adjustments"("case_id", "requested_at");
CREATE INDEX "approval_quality_adjustments_status_requested_at_idx" ON "approval_quality_adjustments"("status", "requested_at");

-- AddForeignKey
ALTER TABLE "approval_quality_adjustments" ADD CONSTRAINT "approval_quality_adjustments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "approval_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_quality_adjustments" ADD CONSTRAINT "approval_quality_adjustments_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "approval_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_quality_adjustments" ADD CONSTRAINT "approval_quality_adjustments_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_quality_adjustments" ADD CONSTRAINT "approval_quality_adjustments_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
