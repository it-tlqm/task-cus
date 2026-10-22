-- F18 — Nhat ky tac nghiep dung danh muc TX + QD1277 va lien thong V3 (additive)
ALTER TABLE "routine_entries" ADD COLUMN     "catalog_entry_id" TEXT,
ADD COLUMN     "product_item_id" TEXT,
ADD COLUMN     "proposed_products" TEXT,
ADD COLUMN     "source_kind" TEXT,
ADD COLUMN     "source_ref_id" TEXT,
ADD COLUMN     "source_code_snapshot" TEXT,
ADD COLUMN     "review_state" TEXT,
ADD COLUMN     "data_origin" TEXT;

CREATE INDEX "routine_entries_period_id_idx" ON "routine_entries"("period_id");
CREATE INDEX "routine_entries_person_id_idx" ON "routine_entries"("person_id");
CREATE INDEX "routine_entries_unit_id_idx" ON "routine_entries"("unit_id");
CREATE INDEX "routine_entries_occurrence_status_idx" ON "routine_entries"("occurrence_status");
CREATE INDEX "routine_entries_catalog_entry_id_idx" ON "routine_entries"("catalog_entry_id");
CREATE INDEX "routine_entries_product_item_id_idx" ON "routine_entries"("product_item_id");

ALTER TABLE "routine_entries" ADD CONSTRAINT "routine_entries_catalog_entry_id_fkey" FOREIGN KEY ("catalog_entry_id") REFERENCES "work_catalog_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "routine_entries" ADD CONSTRAINT "routine_entries_product_item_id_fkey" FOREIGN KEY ("product_item_id") REFERENCES "product_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
