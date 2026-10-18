-- YC-24 PHƯƠNG ÁN B — ROLLBACK THỦ CÔNG (CHỈ KHI CÓ PHÊ DUYỆT RIÊNG)
--
-- CẢNH BÁO AN TOÀN — đọc trước khi chạy:
--  • Về khôi phục unique cũ (date, slot_key): nếu từng có 2 bộ phận phân công CÙNG vị trí/ô trong CÙNG ngày,
--    dữ liệu sẽ TRÙNG theo khóa cũ → tạo index cũ sẽ THẤT BẠI. Kiểm tra trước:
--      SELECT date, slot_key, count(*) FROM duty_rosters WHERE slot_key IS NOT NULL
--      GROUP BY date, slot_key HAVING count(*) > 1;
--    Nếu có kết quả: KHÔNG chạy rollback này (giữ schema mới) — rollback code là đủ an toàn.
--  • KHÔNG xóa bảng/cột/dữ liệu. Không chạy prisma migrate deploy / db push.
-- Ưu tiên số 1 khi sự cố: ROLLBACK CODE (deploy lại commit main cũ). Schema mới tương thích code cũ
--  (code cũ không đọc/ghi unit_id ở duty_positions/duty_day_infos và không dùng unique index) → không cần rollback schema.

-- 1) duty_day_infos: khôi phục unique (date)
DROP INDEX "duty_day_infos_unit_id_date_key";
CREATE UNIQUE INDEX "duty_day_infos_date_key" ON "duty_day_infos"("date");
DROP INDEX "duty_day_infos_unit_id_idx";
ALTER TABLE "duty_day_infos" DROP CONSTRAINT "duty_day_infos_unit_id_fkey";
ALTER TABLE "duty_day_infos" DROP COLUMN "unit_id";

-- 2) duty_rosters: khôi phục unique (date, slot_key)
CREATE INDEX "duty_rosters_date_unit_id_idx" ON "duty_rosters"("date", "unit_id");
DROP INDEX "duty_rosters_unit_id_date_idx";
DROP INDEX "duty_rosters_unit_id_date_slot_key_key";
CREATE UNIQUE INDEX "duty_rosters_date_slot_key_key" ON "duty_rosters"("date", "slot_key");

-- 3) duty_positions: gỡ quan hệ sở hữu bộ phận
DROP INDEX "duty_positions_unit_id_status_sort_order_idx";
ALTER TABLE "duty_positions" DROP CONSTRAINT "duty_positions_unit_id_fkey";
ALTER TABLE "duty_positions" DROP COLUMN "unit_id";
