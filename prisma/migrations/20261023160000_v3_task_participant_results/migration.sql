-- YC-09 Phase 1 - ket qua phan viec theo tung nguoi (additive).
-- Mot ApprovalCase/Task; participant result/event la du lieu con, khong tao case rieng.
-- Khong cham QD1277/monthly/scoring/quality/team/stage.

-- AlterTable
ALTER TABLE "task_updates" ADD COLUMN     "participant_event_id" TEXT,
ADD COLUMN     "subject_person_id" TEXT;

-- CreateTable
CREATE TABLE "task_participant_results" (    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COLLABORATOR',
    "part_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "part_result_text" TEXT,
    "part_completed_on" DATE,
    "part_progress_percent" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "submitted_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "decision_note" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_participant_results_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_participant_results"
  ADD CONSTRAINT "task_participant_results_role_check" CHECK ("role" IN ('OWNER','COLLABORATOR')),
  ADD CONSTRAINT "task_participant_results_status_check" CHECK ("part_status" IN ('NOT_STARTED','IN_PROGRESS','SUBMITTED','RETURNED','ACCEPTED','EXEMPT')),
  ADD CONSTRAINT "task_participant_results_progress_check" CHECK ("part_progress_percent" IS NULL OR ("part_progress_percent" BETWEEN 0 AND 100 AND "part_progress_percent" % 5 = 0)),
  ADD CONSTRAINT "task_participant_results_round_check" CHECK ("round" >= 1);

-- CreateTable
CREATE TABLE "task_participant_events" (
    "id" TEXT NOT NULL,
    "participant_result_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "actor_account_id" TEXT,
    "actor_person_id" TEXT,
    "note" TEXT,
    "result_text_snapshot" TEXT,
    "completed_on_snapshot" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_participant_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_participant_events"
  ADD CONSTRAINT "task_participant_events_type_check" CHECK ("event_type" IN ('SUBMIT','PROGRESS','RETURN','ACCEPT','EXEMPT','REOPEN','PRECHECK_PASS','PRECHECK_RETURN')),
  ADD CONSTRAINT "task_participant_events_round_check" CHECK ("round" >= 1);

-- CreateTable
CREATE TABLE "task_submission_snapshots" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "submitted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_submission_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_submission_snapshots"
  ADD CONSTRAINT "task_submission_snapshots_round_check" CHECK ("round" >= 1);

-- CreateIndex
CREATE INDEX "task_participant_results_task_id_part_status_idx" ON "task_participant_results"("task_id", "part_status");

-- CreateIndex
CREATE INDEX "task_participant_results_person_id_part_status_idx" ON "task_participant_results"("person_id", "part_status");

-- CreateIndex
CREATE UNIQUE INDEX "task_participant_results_task_id_person_id_key" ON "task_participant_results"("task_id", "person_id");

-- CreateIndex
CREATE INDEX "task_participant_events_participant_result_id_created_at_idx" ON "task_participant_events"("participant_result_id", "created_at");

-- CreateIndex
CREATE INDEX "task_participant_events_task_id_created_at_idx" ON "task_participant_events"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_participant_events_person_id_created_at_idx" ON "task_participant_events"("person_id", "created_at");

-- CreateIndex
CREATE INDEX "task_submission_snapshots_task_id_created_at_idx" ON "task_submission_snapshots"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_submission_snapshots_task_id_round_key" ON "task_submission_snapshots"("task_id", "round");

-- CreateIndex
CREATE INDEX "task_updates_task_id_subject_person_id_created_at_idx" ON "task_updates"("task_id", "subject_person_id", "created_at");

-- AddForeignKey
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_subject_person_id_fkey" FOREIGN KEY ("subject_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_results" ADD CONSTRAINT "task_participant_results_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_results" ADD CONSTRAINT "task_participant_results_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_results" ADD CONSTRAINT "task_participant_results_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_results" ADD CONSTRAINT "task_participant_results_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_events" ADD CONSTRAINT "task_participant_events_participant_result_id_fkey" FOREIGN KEY ("participant_result_id") REFERENCES "task_participant_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_events" ADD CONSTRAINT "task_participant_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_events" ADD CONSTRAINT "task_participant_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_events" ADD CONSTRAINT "task_participant_events_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participant_events" ADD CONSTRAINT "task_participant_events_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_snapshots" ADD CONSTRAINT "task_submission_snapshots_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_snapshots" ADD CONSTRAINT "task_submission_snapshots_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;


