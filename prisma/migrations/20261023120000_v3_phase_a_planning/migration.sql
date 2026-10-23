-- V3 Phase A: chống gửi trùng đầu việc theo cặp (cán bộ, idempotency_key).
-- Các khóa cũ bị trùng (nếu có) được giữ lại ở bản ghi mới nhất; bản ghi cũ hơn
-- được đặt NULL để không xóa nội dung nghiệp vụ và vẫn cho phép tạo unique index.
--
-- LƯU Ý PHÁT HÀNH (S1 QA 23/10/2026):
--   Production được dựng bằng `prisma db push` và KHÔNG có bảng `_prisma_migrations`.
--   Không chạy `prisma migrate deploy` trên Production (sẽ cố chạy 0_init và phá dữ liệu).
--   Trước khi chạy migration này (thủ công hoặc qua db push), phải:
--     1) Kiểm tra/backup các idempotency_key hiện có;
--     2) Chạy UPDATE dọn khóa trùng bên dưới trước khi tạo unique index;
--     3) Diễn tập trên bản sao schema/dữ liệu gần nhất.
--   `IF NOT EXISTS` giữ migration an toàn khi index đã được tạo bởi `db push`
--   hoặc khi release được chạy lại sau lỗi giữa chừng.

UPDATE "personal_work_items" AS p
SET "idempotency_key" = NULL
WHERE p."idempotency_key" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "personal_work_items" AS q
    WHERE q."person_id" = p."person_id"
      AND q."idempotency_key" = p."idempotency_key"
      AND (
        q."created_at" > p."created_at"
        OR (q."created_at" = p."created_at" AND q."id" > p."id")
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "personal_work_items_person_idempotency_key"
  ON "personal_work_items"("person_id", "idempotency_key");
