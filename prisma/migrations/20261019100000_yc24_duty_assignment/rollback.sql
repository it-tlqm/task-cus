-- YC-24 — ROLLBACK KHẨN CẤP (CHỈ chạy khi có phê duyệt riêng + đã sao lưu đầy đủ).
-- Bình thường KHÔNG cần file này: DDL additive nên chỉ cần gỡ code là đủ (cột/bảng mới nằm im).
-- CẢNH BÁO: các lệnh dưới đây XÓA cột/bảng mới => MẤT dữ liệu phân công YC-24 nếu đã nhập.

-- Gỡ liên kết + cột mới trên duty_rosters
ALTER TABLE "duty_rosters" DROP CONSTRAINT IF EXISTS "duty_rosters_position_id_fkey";
DROP INDEX IF EXISTS "duty_rosters_date_slot_key_key";
DROP INDEX IF EXISTS "duty_rosters_date_position_id_idx";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "position_id";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "position_title";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "position_detail";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "position_order";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "slot_label";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "slot_order";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "slot_key";
ALTER TABLE "duty_rosters" DROP COLUMN IF EXISTS "reason";

-- Gỡ bảng mới
DROP TABLE IF EXISTS "duty_day_infos";
ALTER TABLE "duty_positions" DROP CONSTRAINT IF EXISTS "duty_positions_created_by_id_fkey";
DROP TABLE IF EXISTS "duty_positions";
