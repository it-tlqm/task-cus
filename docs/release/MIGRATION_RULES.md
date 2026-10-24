# QUY TẮC MIGRATION & BACKUP PRODUCTION

- **Áp dụng cho:** Production `tlqm/task-cus`, mọi bản restore/rehearsal từ Production, và mọi thay đổi schema/dữ liệu hệ thống.
- **Hiệu lực:** từ 24/10/2026.
- **Liên quan:** [`PRODUCTION_MIGRATION_LEDGER_2026-10-24.md`](./PRODUCTION_MIGRATION_LEDGER_2026-10-24.md) · [`BACKUP_RESTORE_REMEDIATION_2026-10-24.md`](../evidence/release/BACKUP_RESTORE_REMEDIATION_2026-10-24.md) · [`PRODUCTION_RELEASE_PLAN_2026-10-23.md`](./PRODUCTION_RELEASE_PLAN_2026-10-23.md)

> Bối cảnh: Production được dựng bằng `prisma db push`, **không có bảng `_prisma_migrations`**. Prisma không biết migration nào đã áp. Mọi thao tác schema phải thủ công, có kiểm soát và có biên bản.

---

## 1. NGUYÊN TẮC GỐC

1. **Không chạy `prisma migrate deploy` trên Production.** Không có baseline → Prisma sẽ chạy `0_init` và có thể phá dữ liệu.
2. **Không chạy `prisma db push`, `db push --accept-data-loss`, `migrate reset`, hoặc reset tài khoản/dữ liệu** trên Production.
3. **Additive trước.** Ưu tiên thêm bảng/cột/index; không drop/rename cột, không đổi kiểu dữ liệu trong release nóng.
4. **Không có backup đã kiểm tra restore + preflight read-only + phê duyệt → không chạy migration.**

---

## 2. TRƯỚC MIGRATION (BẮT BUỘC)

### R1 — Backup schema + data

- Backup **schema** và **data** riêng (logical backup bằng công cụ ops được duyệt).
- Tính **SHA-256** cho từng file; ghi ngày, giờ, người thực hiện.
- Lưu **ngoài repo**, ACL chỉ user ops; không commit, không gửi qua chat.
- Không xóa backup cũ.

### R2 — Restore rehearsal

- Restore vào database clone **không phải Production** (đặt tên `talung_v3_*_rehearsal_<ngày>`).
- Đối chiếu counts các bảng nghiệp vụ; yêu cầu **`restore_mismatches = 0`**.
- Áp thử đúng migration sắp chạy trên bản restore.
- Chạy `prisma migrate diff` giữa bản restore sau migration và Prisma schema; yêu cầu **`No difference`**.

### R3 — Preflight read-only

- Chạy `docs/release/PREFLIGHT_PRODUCTION_AUDIT.sql` bằng credential **read-only**.
- Lưu output vào biên bản release; không ghi credential.
- Đối chiếu từng object của migration: bảng, cột, index, constraint, permission.

**Ma trận quyết định:**

| Kết quả preflight | Hành động |
|---|---|
| Tất cả object đã có | **Không chạy DDL**; ghi “already applied”; chỉ deploy code |
| Chưa có object nào | Chạy đúng file migration sau backup/restore rehearsal |
| Có một phần object | **STOP** — không release; lập phương án xử lý drift |
| Có khóa/dữ liệu bất thường | **STOP** — xác nhận với chủ dự án trước khi backfill |

### R4 — Đóng băng và phê duyệt

- RC/deploy đóng băng; không commit mới trong lúc chạy migration.
- Có lệnh release riêng của chủ dự án và xác nhận của ops/DBA.
- Ghi rõ cửa sổ bảo trì và người trực.

---

## 3. THỰC THI

### R5 — Mỗi file một lần chạy

```bash
# PROD_WRITE_URL chỉ đặt trong biến môi trường/secret ngoài repo
psql "$PROD_WRITE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/<migration_name>/migration.sql
```

- **Một file = một lệnh.** Không pipe cả thư mục, không gộp nhiều file, không copy-paste nhiều câu DDL vào một lần Run.
- Luôn đặt `ON_ERROR_STOP=1`; không bỏ qua lỗi.
- Chạy đúng thứ tự đã duyệt trong kế hoạch release.

### R6 — Sau mỗi file

1. Chạy lại **đúng section preflight** của migration vừa áp.
2. Ghi kết quả: thời điểm, người, object đã tạo, counts ảnh hưởng.
3. Nếu lỗi hoặc object tạo một phần → **STOP** ngay, không chạy file tiếp theo.
4. Chỉ chuyển file kế tiếp khi section preflight PASS.

### R7 — Partial apply

- **STOP.** Không chạy lại mù, không “sửa tay cho xong”.
- Chụp lại trạng thái object hiện tại (read-only).
- Quyết định: restore backup **hoặc** lập migration sửa riêng đã được duyệt.
- Ghi biên bản sự cố; không tiếp tục release cho đến khi xử lý xong.

### R8 — Không dùng transaction tự động nếu công cụ không hỗ trợ

- Theo runbook ops; không giả định toàn bộ file là một transaction.
- Với file nhiều bước, chuẩn bị phương án restore trước khi chạy.

---

## 4. VIẾT MIGRATION MỚI

### R9 — Không sửa migration đã áp

- 7 migration V3.1/V3.2 là **lịch sử bất biến**; checksum đã ghi trong ledger.
- Thay đổi mới = **migration mới**, không sửa file cũ.
- Nếu cần guard cho môi trường mới, tạo migration mới có kiểm tra object.

### R10 — Bắt buộc idempotent hoặc có preflight object check

Ưu tiên viết idempotent:

```sql
ALTER TABLE "example" ADD COLUMN IF NOT EXISTS "new_col" TEXT;
CREATE TABLE IF NOT EXISTS "example_new" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS "example_new_idx" ON "example_new"("code");

INSERT INTO "permissions" ("id","code","name","module","created_at")
SELECT gen_random_uuid()::text, 'x.y', 'Tên', 'MODULE', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'x.y');

INSERT INTO "example_new" ("id","code")
SELECT gen_random_uuid()::text, v.code
FROM (VALUES ('A'), ('B')) AS v(code)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'example_new_check') THEN
    ALTER TABLE "example_new"
      ADD CONSTRAINT "example_new_check" CHECK ("col" IN ('A','B'));
  END IF;
END $$;
```

Nếu **không thể** idempotent (ví dụ `CREATE TABLE` có FK/index đi kèm):

- Viết **preflight object check** trong PR/migration note:
  ```sql
  SELECT to_regclass('public.<table>') AS table_exists;
  SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = '<table>' AND column_name IN (...);
  SELECT indexname FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = '<table>';
  SELECT conname FROM pg_constraint WHERE conname IN (...);
  ```
- Nếu preflight thấy **một phần** object đã tồn tại → **STOP**, không chạy.
- Ghi rõ trong PR: “không idempotent — chỉ chạy khi object chưa có”.

### R11 — Không seed dữ liệu nghiệp vụ ngoài phạm vi

- Migration chỉ chứa DDL + dữ liệu hệ thống đã được duyệt (permission, rule).
- Không seed target/baseline/entry, không tạo tài khoản, không reset dữ liệu.
- Backfill dữ liệu phải có audit event và đối chiếu trước/sau.

---

## 5. SAU MIGRATION

### R12 — Xác minh schema

- Chạy preflight các section liên quan; xác nhận bảng/cột/index/FK/permission.
- Chạy `prisma migrate diff` nếu có thể; yêu cầu `No difference`.
- Đối chiếu counts nghiệp vụ trước/sau; mọi chênh lệch ngoài dự kiến → điều tra.

### R13 — Ghi sổ migration

- Thêm dòng vào `PRODUCTION_MIGRATION_LEDGER_2026-10-24.md`:
  tên migration, SHA-256, ngày + giờ Việt Nam, người thực hiện, kết quả, counts, ghi chú.
- Không sửa dòng cũ; đính chính bằng ghi chú mới.

### R14 — Theo dõi sau release

- Theo dõi 5xx, auth, approval, migration errors tối thiểu 24h.
- Không xóa backup cho đến khi có sign-off và có lớp backup thay thế.

---

## 6. BACKUP / PITR

- **Không mặc định Production có PITR hay backup tự động.** Tại audit 24/10/2026, PITR đang tắt và danh sách backup provider trống; phải xác nhận lại trước mỗi release.
- Trước release có DDL: bắt buộc có backup logical + restore rehearsal PASS (R1–R2).
- Ghi rõ: backup ID (nếu có), nơi lưu, thời hạn giữ, người phụ trách.
- Nếu PITR tắt: ops phải quyết định bật hoặc chấp nhận rủi ro **bằng văn bản**; không ghi “đã có PITR” khi chưa xác minh.
- Restore rehearsal định kỳ; không chỉ dựa vào việc “backup chạy thành công”.

---

## 7. ROLLBACK

1. **Rollback code trước**, giữ schema additive.
2. Không drop bảng/cột khi chưa có phê duyệt riêng + backup đã kiểm tra.
3. Migration partial → restore backup, rollback code, không chạy lại mù.
4. Rollback schema có thể mất dữ liệu phát sinh sau release; phải được chủ dự án chấp thuận.
5. Tắt ngay flag thử nghiệm (`V3_YC10_QUALITY`, `V3_YC11_PRECHECK`) nếu bật nhầm.

---

## 8. CHECKLIST NGẮN

**Trước:**

- [ ] Backup schema + data, SHA-256, lưu ngoài repo
- [ ] Restore rehearsal PASS, counts khớp
- [ ] Migration rehearsal trên bản restore PASS, `migrate diff` No difference
- [ ] Preflight read-only: all-present / none-present (không partial)
- [ ] RC đóng băng, lệnh release + ops xác nhận
- [ ] PITR/backup provider đã xác nhận (hoặc rủi ro được chấp thuận bằng văn bản)

**Trong:**

- [ ] Từng file, `ON_ERROR_STOP=1`, đúng thứ tự
- [ ] Preflight lại sau mỗi file
- [ ] Lỗi/partial → STOP

**Sau:**

- [ ] Schema/constraint/permission đúng
- [ ] Counts không đổi ngoài dự kiến
- [ ] Ghi ledger (giờ, người, kết quả)
- [ ] Health/smoke PASS
- [ ] Theo dõi 24h
