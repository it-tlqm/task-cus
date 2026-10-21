-- V3.0.2 — Xac nhan tung san pham QD1277 doc lap (Q-B4/A-1, A-3, A-4) — additive, khong sua du lieu cu
ALTER TABLE "work_item_products" ADD COLUMN     "review_state" TEXT,
ADD COLUMN     "proposed_by_id" TEXT,
ADD COLUMN     "proposed_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_by_id" TEXT,
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "quantity_unit" TEXT,
ADD COLUMN     "factor_snapshot" DOUBLE PRECISION,
ADD COLUMN     "factor_source" TEXT;

CREATE INDEX "work_item_products_work_item_id_review_state_idx" ON "work_item_products"("work_item_id", "review_state");
