-- YC-11 Phase 3 - anh chup tuyen pre-check/final theo PersonSupervision (additive).
-- Khong role/quyen/stage moi; khong seed person_supervisions.
-- Snapshot ghi khi chu tri nop ket qua chung; tuyen doi sau do khong viet lai.
-- case_id nullable vi ApprovalCase chi duoc tao o lan quyet dinh dau (S4).

-- CreateTable
CREATE TABLE "approval_route_snapshots" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "case_id" TEXT,
    "round" INTEGER NOT NULL,
    "route_status" TEXT NOT NULL,
    "route_json" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_route_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_route_snapshots"
  ADD CONSTRAINT "approval_route_snapshots_route_status_check"
    CHECK ("route_status" IN ('READY','WAITING_ASSIGNMENT','CYCLE','AMBIGUOUS')),
  ADD CONSTRAINT "approval_route_snapshots_round_check"
    CHECK ("round" >= 1);

-- CreateIndex
CREATE UNIQUE INDEX "approval_route_snapshots_task_id_round_key"
  ON "approval_route_snapshots"("task_id", "round");
CREATE INDEX "approval_route_snapshots_task_id_created_at_idx"
  ON "approval_route_snapshots"("task_id", "created_at");
CREATE INDEX "approval_route_snapshots_case_id_idx"
  ON "approval_route_snapshots"("case_id");

-- AddForeignKey
ALTER TABLE "approval_route_snapshots"
  ADD CONSTRAINT "approval_route_snapshots_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_route_snapshots"
  ADD CONSTRAINT "approval_route_snapshots_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "approval_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_route_snapshots"
  ADD CONSTRAINT "approval_route_snapshots_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
