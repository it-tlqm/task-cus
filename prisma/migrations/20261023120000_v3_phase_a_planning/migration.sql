-- V3 Phase A: chống gửi trùng đầu việc theo cặp (cán bộ, idempotency_key).
-- Các khóa cũ bị trùng (nếu có) được giữ lại ở bản ghi mới nhất; bản ghi cũ hơn
-- được đặt NULL để không xóa nội dung nghiệp vụ và vẫn cho phép tạo unique index.

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

CREATE UNIQUE INDEX "personal_work_items_person_idempotency_key"
  ON "personal_work_items"("person_id", "idempotency_key");
