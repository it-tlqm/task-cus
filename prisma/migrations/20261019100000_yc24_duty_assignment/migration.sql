-- YC-24 — PHÂN CÔNG NHIỆM VỤ VÀ LỊCH TRỰC (theo mẫu "Sổ phân công nhiệm vụ" của Hải quan)
-- DDL ADDITIVE — KHÔNG xóa/đổi cột cũ, KHÔNG sửa dữ liệu hiện có. Chạy lại an toàn (idempotent qua scripts/apply-yc24-ddl.ts).
-- Nguồn mẫu: docs/Dữ liệu-file-hai-quan-gui/so phan cong nhiem vu.xls (sheet ND, 8 nhóm nhiệm vụ).

-- 1) DANH MỤC VỊ TRÍ/NHIỆM VỤ PHÂN CÔNG (bảng mới)
CREATE TABLE "duty_positions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "slots" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_positions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "duty_positions_code_key" ON "duty_positions"("code");
CREATE INDEX "duty_positions_status_sort_order_idx" ON "duty_positions"("status", "sort_order");

ALTER TABLE "duty_positions" ADD CONSTRAINT "duty_positions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) THÔNG TIN TỔNG HỢP THEO NGÀY (Tổng số công chức / Có mặt / Vắng / Lý do) — bảng mới
CREATE TABLE "duty_day_infos" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "total_staff" INTEGER,
    "present_staff" INTEGER,
    "absent_count" INTEGER,
    "absent_reason" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_day_infos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "duty_day_infos_date_key" ON "duty_day_infos"("date");

-- 3) BỔ SUNG CỘT LIÊN KẾT TRÊN duty_rosters (bản ghi cũ giữ nguyên; cột mới NULL với dữ liệu cũ)
ALTER TABLE "duty_rosters" ADD COLUMN "position_id" TEXT;
ALTER TABLE "duty_rosters" ADD COLUMN "position_title" TEXT;
ALTER TABLE "duty_rosters" ADD COLUMN "position_detail" TEXT;
ALTER TABLE "duty_rosters" ADD COLUMN "position_order" INTEGER;
ALTER TABLE "duty_rosters" ADD COLUMN "slot_label" TEXT;
ALTER TABLE "duty_rosters" ADD COLUMN "slot_order" INTEGER;
ALTER TABLE "duty_rosters" ADD COLUMN "slot_key" TEXT;
ALTER TABLE "duty_rosters" ADD COLUMN "reason" TEXT;

CREATE INDEX "duty_rosters_date_position_id_idx" ON "duty_rosters"("date", "position_id");
-- Chống trùng ô: một ô của biểu chỉ có một bản ghi/ngày (bản ghi cũ slot_key NULL không ảnh hưởng)
CREATE UNIQUE INDEX "duty_rosters_date_slot_key_key" ON "duty_rosters"("date", "slot_key");

ALTER TABLE "duty_rosters" ADD CONSTRAINT "duty_rosters_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "duty_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) NẠP SẴN 8 NHÓM NHIỆM VỤ ĐÚNG MẪU (chỉ chèn khi chưa có mã — chạy lại không nhân đôi, không ghi đè)
INSERT INTO "duty_positions" ("id", "code", "title", "detail", "slots", "sort_order", "status", "created_at", "updated_at") VALUES
('yc24-pos-01', 'YC24-01', 'Trực lãnh đạo', NULL, '[{"k":"s1","l":null}]'::jsonb, 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('yc24-pos-02', 'YC24-02', 'Đăng ký tờ khai hải quan:', 'Kiểm tra Thuế, lệ phí HQ & Đối chiếu phí cơ sở hạ tầng', '[{"k":"s1","l":null},{"k":"s2","l":null}]'::jsonb, 2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('yc24-pos-03', 'YC24-03', 'Tiếp nhận, kiểm tra hồ sơ hải quan', NULL, '[{"k":"s1","l":null},{"k":"s2","l":null}]'::jsonb, 3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('yc24-pos-04', 'YC24-04', 'Trả hồ sơ hải quan', NULL, '[{"k":"s1","l":null}]'::jsonb, 4, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('yc24-pos-05', 'YC24-05', 'Giám sát hàng hóa XNK & PTVT (Barie số 1)', NULL, '[{"k":"s1","l":null},{"k":"s2","l":null}]'::jsonb, 5, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('yc24-pos-06', 'YC24-06', 'Giám sát hành lý, hàng hóa của CDBG, hành khách XNC & máy soi hành lý', NULL, '[{"k":"nc","l":"NC"},{"k":"xc","l":"XC"}]'::jsonb, 6, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('yc24-pos-07', 'YC24-07', 'Trực CNTT (hồi báo/ IT)', NULL, '[{"k":"s1","l":null}]'::jsonb, 7, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('yc24-pos-08', 'YC24-08', 'Trực trưa:', NULL, '[{"k":"t1","l":"Vị trí cửa Nhập cảnh"},{"k":"t2","l":"Vị trí cửa Xuất cảnh"},{"k":"t3","l":"Vị trí Barie số 1"},{"k":"t4","l":"Vị trí bãi Phú Anh"},{"k":"t5","l":"Vị trí bãi Sơn Cảng"},{"k":"t6","l":"Vị trí bãi BA & XNK"}]'::jsonb, 8, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
