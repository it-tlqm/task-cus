-- Gop y & bao loi trong app (additive)
CREATE TABLE "feedbacks" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GOP_Y',
  "content" TEXT NOT NULL,
  "page_path" TEXT,
  "user_agent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "admin_note" TEXT,
  "person_id" TEXT NOT NULL,
  "resolved_by_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feedbacks_status_created_at_idx" ON "feedbacks"("status", "created_at");
CREATE INDEX "feedbacks_person_id_created_at_idx" ON "feedbacks"("person_id", "created_at");
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
