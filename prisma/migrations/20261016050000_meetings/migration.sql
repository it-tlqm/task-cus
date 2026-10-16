-- Bien ban giao ban -> nhiem vu (additive)
CREATE TABLE "meetings" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "meeting_at" TIMESTAMP(3) NOT NULL,
  "chair" TEXT,
  "unit_id" TEXT,
  "notes" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "meetings_meeting_at_idx" ON "meetings"("meeting_at");

CREATE TABLE "meeting_conclusions" (
  "id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "owner_id" TEXT,
  "assignee_ids" TEXT[] NOT NULL DEFAULT '{}',
  "deadline" TIMESTAMP(3),
  "priority" TEXT NOT NULL DEFAULT 'Cao',
  "task_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_conclusions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "meeting_conclusions_meeting_id_idx" ON "meeting_conclusions"("meeting_id");
ALTER TABLE "meeting_conclusions" ADD CONSTRAINT "meeting_conclusions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
