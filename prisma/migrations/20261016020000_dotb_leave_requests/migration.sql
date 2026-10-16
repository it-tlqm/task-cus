-- Dot B v1: don nghi phep/bu/cong tac/cuoi tuan (additive)
CREATE TABLE "leave_requests" (
  "id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "handover_to_id" TEXT,
  "handover_notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_requests_person_id_status_idx" ON "leave_requests"("person_id", "status");
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_handover_to_id_fkey" FOREIGN KEY ("handover_to_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
