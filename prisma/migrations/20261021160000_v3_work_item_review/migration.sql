-- V3.0.1 — Vong doi xac nhan cong viec tu ghi nhan (additive, khong sua du lieu cu)
-- Quyet dinh nghiep vu: A, A1, B2, C1, D1-A (va R3-C cho phan khoa minh chung)
-- Khong migration doi voi bang khac; khong doi duyet lieu lich su.

-- AlterTable
ALTER TABLE "personal_work_items" ADD COLUMN     "review_state" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "result_text" TEXT,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "submitted_by_id" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT,
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "submit_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "work_item_reviews" (
    "id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "result_text" TEXT,
    "completed_on" DATE,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_item_reviews_work_item_id_created_at_idx" ON "work_item_reviews"("work_item_id", "created_at");

-- CreateIndex
CREATE INDEX "work_item_reviews_actor_id_idx" ON "work_item_reviews"("actor_id");

-- AddForeignKey
ALTER TABLE "work_item_reviews" ADD CONSTRAINT "work_item_reviews_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "personal_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_reviews" ADD CONSTRAINT "work_item_reviews_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
