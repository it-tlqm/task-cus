-- YC-24 PHƯƠNG ÁN B — BẢNG PHÂN CÔNG THEO (BỘ PHẬN + NGÀY + Ô)
--
-- Đánh giá ảnh hưởng (bắt buộc theo yêu cầu):
--  • Dữ liệu: KHÔNG xóa cột, KHÔNG xóa dòng, KHÔNG sửa dữ liệu cũ.
--  • duty_rosters: đổi unique từ (date, slot_key) sang (unit_id, date, slot_key).
--    - Bản ghi cũ: slot_key NULL (chưa từng gán bởi YC-24) → không xung đột (PostgreSQL bỏ qua NULL trong unique).
--    - Unique mới YẾU HƠN unique cũ theo từng (date, slot_key) → không thể fail khi tạo index.
--  • duty_positions: thêm cột unit_id (NULL với bản ghi hiện có - gán sau bằng scripts/seed-yc24-catalog.ts
--    theo đúng bộ phận được xác định; KHÔNG tự gán hàng loạt).
--  • duty_day_infos: đổi unique từ (date) sang (unit_id, date).
--  • Code cũ (main hiện hành): không đọc/ghi các cột & index này → không bị ảnh hưởng.
--  • Rollback: prisma/migrations/20261020100000_yc24b_per_department/rollback.sql (chỉ khi được duyệt;
--    có ràng buộc kiểm tra trùng lặp trước khi khôi phục unique cũ).
--  • Idempotent khi chạy qua scripts/apply-yc24b-ddl.ts (IF NOT EXISTS / IF EXISTS + kiểm tra pg_constraint).
--  • KHÔNG chạy prisma migrate deploy / db push.

-- 1) duty_positions: danh mục vị trí SỞ HỮU theo bộ phận (quan hệ sở hữu)
ALTER TABLE "duty_positions" ADD COLUMN "unit_id" TEXT;
CREATE INDEX "duty_positions_unit_id_status_sort_order_idx" ON "duty_positions"("unit_id", "status", "sort_order");
ALTER TABLE "duty_positions" ADD CONSTRAINT "duty_positions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) duty_rosters: định danh bảng = (bộ phận, ngày, ô)
DROP INDEX "duty_rosters_date_slot_key_key";
CREATE UNIQUE INDEX "duty_rosters_unit_id_date_slot_key_key" ON "duty_rosters"("unit_id", "date", "slot_key");
CREATE INDEX "duty_rosters_unit_id_date_idx" ON "duty_rosters"("unit_id", "date");
DROP INDEX "duty_rosters_date_unit_id_idx";

-- 3) duty_day_infos: thông tin tổng hợp ngày gắn với (bộ phận, ngày)
ALTER TABLE "duty_day_infos" ADD COLUMN "unit_id" TEXT;
CREATE INDEX "duty_day_infos_unit_id_idx" ON "duty_day_infos"("unit_id");
ALTER TABLE "duty_day_infos" ADD CONSTRAINT "duty_day_infos_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX "duty_day_infos_date_key";
CREATE UNIQUE INDEX "duty_day_infos_unit_id_date_key" ON "duty_day_infos"("unit_id", "date");
