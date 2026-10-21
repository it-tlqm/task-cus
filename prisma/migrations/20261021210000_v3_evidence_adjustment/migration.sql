-- V3.0.3 — Quy trinh dieu chinh minh chung sau khi da xac nhan (R3-C) — additive
ALTER TABLE "work_evidences" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "superseded_by_id" TEXT,
ADD COLUMN     "withdrawn_note" TEXT;

CREATE TABLE "work_evidence_adjustments" (
    "id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "evidence_id" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "proposed_file_name" TEXT,
    "proposed_storage_key" TEXT,
    "proposed_size" INTEGER,
    "proposed_mime" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposed_by_id" TEXT NOT NULL,
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leader_reviewed_by_id" TEXT,
    "leader_reviewed_at" TIMESTAMP(3),
    "leader_note" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approval_note" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_evidence_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_evidence_adjustments_work_item_id_created_at_idx" ON "work_evidence_adjustments"("work_item_id", "created_at");
CREATE INDEX "work_evidence_adjustments_state_idx" ON "work_evidence_adjustments"("state");
ALTER TABLE "work_evidence_adjustments" ADD CONSTRAINT "work_evidence_adjustments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_evidence_adjustments" ADD CONSTRAINT "work_evidence_adjustments_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "work_evidences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
