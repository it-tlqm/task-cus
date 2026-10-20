-- YC-31 (bổ sung 20/10/2026) — Danh mục TX1: hệ số quy đổi + mã nhóm + mã đầu việc theo nhóm.
--
-- BẢN CHẤT:
--  1. work_catalog_entries: thêm group_code (mã nhóm NV/CNTT/CBL/PT/TH/DANG) và
--     convert_factor (hệ số quy đổi, NULL = ô trống trong file nguồn, 0 = hệ số bằng 0).
--  2. Bỏ ràng buộc UNIQUE (version_id, department, title): file nguồn TX1 có 13 cặp
--     tên trùng TRONG CÙNG nhóm "Nghiệp vụ Hải quan" — mỗi dòng là một đầu việc riêng
--     với mã riêng (NV-01 … NV-174). Ràng buộc duy nhất còn lại là (version_id, code).
--  3. Thêm index phục vụ tra cứu theo (version_id, department, title).
--
-- AN TOÀN DỮ LIỆU:
--  - Chỉ ADD COLUMN (nullable / có default) và đổi index — KHÔNG xoá bảng, KHÔNG xoá dòng.
--  - Cột convert_factor cho phép NULL nên đọc được với dữ liệu cũ (bảng đang rỗng ở Production).
--  - Bỏ UNIQUE index không làm mất dữ liệu; dữ liệu cũ (nếu có) vẫn giữ nguyên.
--
-- Idempotent: chạy lại nhiều lần đều an toàn.

-- 1. group_code: mã nhóm suy ra từ tên bộ phận trong file nguồn.
ALTER TABLE "work_catalog_entries" ADD COLUMN IF NOT EXISTS "group_code" TEXT NOT NULL DEFAULT '';

-- 2. convert_factor: hệ số quy đổi trong file nguồn (NULL = chưa có hệ số).
ALTER TABLE "work_catalog_entries" ADD COLUMN IF NOT EXISTS "convert_factor" DECIMAL(12,4);

-- 3. Bỏ ràng buộc trùng (bộ phận + tên) — cho phép tên trùng trong cùng nhóm.
DROP INDEX IF EXISTS "work_catalog_entries_version_id_department_title_key";

-- 4. Index tra cứu thay thế (không unique).
CREATE INDEX IF NOT EXISTS "work_catalog_entries_version_id_department_title_idx"
  ON "work_catalog_entries" ("version_id", "department", "title");

-- 5. Index theo mã nhóm để lọc nhanh 6 nhóm.
CREATE INDEX IF NOT EXISTS "work_catalog_entries_version_id_group_code_idx"
  ON "work_catalog_entries" ("version_id", "group_code");

-- 6. Chế độ chọn đầu việc của phiên bản:
--    MAPPED = chỉ nhóm đã ánh xạ + kích hoạt cho bộ phận;
--    ALL    = mọi cán bộ chọn được mọi nhóm (khi Hải quan chưa xác nhận ánh xạ bộ phận).
ALTER TABLE "work_catalog_versions" ADD COLUMN IF NOT EXISTS "selection_mode" TEXT NOT NULL DEFAULT 'MAPPED';
