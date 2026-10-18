-- HOÀN NGUYÊN YC-23/YC-25 — CHỈ DÙNG NHƯ PHƯƠNG ÁN CUỐI (cần phê duyệt riêng).
--
-- Quy tắc an toàn (bắt buộc đọc trước khi chạy):
--   1. ƯU TIÊN ROLLBACK CODE trước (deploy lại bản cũ / git revert). Toàn bộ thay đổi schema là ADDITIVE
--      (cột nullable + bảng mới) — code cũ chạy bình thường khi schema vẫn còn, KHÔNG cần hoàn nguyên schema.
--   2. GIỮ NGUYÊN schema nếu không gây xung đột. Chỉ chạy tệp này khi thật sự bắt buộc.
--   3. KHÔNG xoá bảng/cột nếu đã có dữ liệu phát sinh (department_work_items có bản ghi nghiệp vụ, hoặc
--      các cột mới đã được ghi) — phải sao lưu + đánh giá dữ liệu trước.
--   4. Mọi lần chạy phải được phê duyệt riêng.
--
-- Thứ tự thực thi (nếu được duyệt): bỏ FK phụ thuộc trước, rồi xoá bảng/cột mới.

ALTER TABLE "monthly_work_results" DROP CONSTRAINT IF EXISTS "monthly_work_results_work_item_id_fkey";
ALTER TABLE "personal_work_items" DROP CONSTRAINT IF EXISTS "personal_work_items_product_item_id_fkey";
ALTER TABLE "personal_work_items" DROP CONSTRAINT IF EXISTS "personal_work_items_dept_work_item_id_fkey";
ALTER TABLE "department_work_items" DROP CONSTRAINT IF EXISTS "department_work_items_created_by_id_fkey";
ALTER TABLE "department_work_items" DROP CONSTRAINT IF EXISTS "department_work_items_unit_id_fkey";
DROP TABLE IF EXISTS "department_work_items";
ALTER TABLE "personal_work_items" DROP COLUMN IF EXISTS "dept_work_item_id";
ALTER TABLE "personal_work_items" DROP COLUMN IF EXISTS "product_item_id";
ALTER TABLE "monthly_work_results" DROP COLUMN IF EXISTS "work_item_id";
