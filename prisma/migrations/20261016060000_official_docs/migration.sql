-- So van ban den/di gon (additive)
CREATE TABLE "official_docs" (
  "id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "from_to" TEXT,
  "doc_date" TIMESTAMP(3),
  "handler_id" TEXT,
  "deadline" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DANG_XU_LY',
  "task_id" TEXT,
  "notes" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "official_docs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "official_docs_direction_status_idx" ON "official_docs"("direction", "status");
ALTER TABLE "official_docs" ADD CONSTRAINT "official_docs_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
