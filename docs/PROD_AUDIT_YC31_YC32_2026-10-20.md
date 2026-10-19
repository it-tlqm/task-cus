# KIỂM TRA PRODUCTION TRƯỚC TRIỂN KHAI YC-31 + YC-32 (20/10/2026)

Phạm vi: chỉ ĐỌC Production (Supabase `ekswvjbpqblssxcdwagi` + Vercel `task-cus.vercel.app`).
Không chạy DDL, không ghi dữ liệu, không merge/push trong lượt này.

## 1. Lịch sử migration Production

- `_prisma_migrations`: **KHÔNG tồn tại** (kiểm tra `to_regclass('public._prisma_migrations')` → NULL).
- Vì vậy **cấm chạy `prisma migrate deploy`** trên Production theo đúng yêu cầu.
- Dự án đang dùng quy ước apply-script idempotent (xem `scripts/apply-*-ddl.ts`, ghi nhận tại `docs/DEPLOYMENT_GUIDE.md`).

## 2. Drift schema Production so với `prisma/schema.prisma`

`prisma migrate diff --from-url <Prod> --to-schema-datamodel prisma/schema.prisma` cho thấy 2 nhóm:

### 2.1. Drift cũ, KHÔNG thuộc YC-31/32 (không áp trong gói này)

- `task_comments_author_id_fkey`: Production đang NO ACTION, schema mong RESTRICT (khác biệt hành vi không đáng kể).
- Index `duty_positions_status_sort_order_idx`: Production có, schema không khai báo → không DROP.
- 12 bảng có `updated_at DEFAULT CURRENT_TIMESTAMP` trên Production nhưng schema không đặt default DB (Prisma tự set khi ghi) → không ALTER.
- 2 index metric bị Prisma đổi tên hiển thị (rename index) → không đổi.

Kết luận: **không áp drift cũ** trong lượt deploy YC-31/32; giữ nguyên hiện trạng Production.

### 2.2. Phần YC-31/32 cần thêm (additive, nullable)

- `personal_work_items`: `catalog_entry_id`, `due_date`, `completed_date`, `task_id` (đều nullable).
- Bảng mới: `work_catalog_versions`, `work_catalog_entries`, `work_evidences`.
- Index mới: 3 unique + các index tra cứu; FK mới tới `people`, `org_units`, `personal_work_items`, `monthly_work_results`, `tasks`.
- Unique mới: `monthly_work_results(person_id, work_item_id)`.

Nguồn DDL: `prisma/migrations/20261021100000_yc31_yc32_work_catalog_evidence/migration.sql`.

## 3. Kiểm tra dữ liệu cũ với ràng buộc mới

- `monthly_work_results`: 15 dòng, **tất cả `work_item_id = NULL`** → không vi phạm unique `(person_id, work_item_id)` (PostgreSQL coi NULL là phân biệt).
- `personal_work_items`: 26 dòng, chưa có các cột mới → thêm nullable an toàn.
- Bảng mới hoàn toàn trống khi tạo.

## 4. Đường nâng cấp an toàn đã kiểm thử (trên bản sao cấu trúc Production, DB cục bộ)

- Tạo clone `talung_prodclone` từ chính cấu trúc Production bằng
  `prisma migrate diff --from-empty --to-url <Prod> --script` → 212 câu lệnh, 61 bảng.
- Thêm script **`scripts/apply-yc31-32-ddl.ts`** (idempotent, additive, không DROP/UPDATE dữ liệu).
- Kết quả trên clone:
  - Lần 1: `applied=22, skipped=0, checks_failed=0`.
  - Lần 2: `applied=14, skipped=8, checks_failed=0` (chạy lại an toàn).
  - Diff còn lại giữa clone và schema chỉ là drift cũ (mục 2.1), **không còn mục YC-31/32**.
- Kiểm thử ràng buộc unique trên clone: nhiều dòng cùng người với `work_item_id = NULL` chèn được; dòng thứ hai cùng `(person, work_item)` bị từ chối bằng `23505`; transaction đã rollback.

## 5. Storage Production — CHƯA ĐẠT

- Bucket hiện có duy nhất: `task-attachments` — **PUBLIC**, policy cho phép `public` INSERT/SELECT/UPDATE/DELETE.
- **Không có bucket `work-evidence`** (GET bucket → NoSuchBucket).
- Môi trường hiện tại **không có `SUPABASE_SERVICE_ROLE_KEY`/secret key**; code sẽ fallback sang publishable key (khóa công khai) → không thể tạo bucket riêng tư, không thể cấp quyền server đọc/ghi an toàn, không thể phát signed URL.
- Kết luận: không được deploy tính năng minh chứng trong trạng thái này; nếu deploy, upload sẽ lỗi (hoặc tệ hơn là phải dùng bucket public — vi phạm yêu cầu).

## 6. Ánh xạ bộ phận của Danh mục TX — CHƯA ĐỦ ĐIỀU KIỆN IMPORT

- File nguồn: 143 đầu việc / 6 khối, khớp bản nhập local: 73 / 5 / 13 / 2 / 42 / 8.
- Trong DB hiện tại, toàn bộ 143 dòng có `unit_id = NULL` (chưa gán đơn vị).
- Đối chiếu tên khối trong file với `org_units` Production:
  - `Bộ phân Nghiệp vụ Hải quan` (73): cần xác nhận có phải `BP_NGHIEPVU_A` không.
  - `Bộ phân TH & Báo cáo` (42): cần xác nhận có phải `BP_TONGHOP_D` không.
  - `Bộ phân Phúc tập & KT STQ` (2): tên gần với mã đơn vị `BỘ PHẬN PHÚC TẬP _ KTSTQ` (name hiển thị "Tổng hợp") — cần xác nhận.
  - `Bộ phận CNTT` (5), `Bộ phân điều tra CBL` (13), `Công tác Đảng` (8): **không có đơn vị tương ứng** trong `org_units`.
- Vì vậy **không import danh mục TX vào Production** cho tới khi Hải quan xác nhận (câu hỏi B2).

## 7. Điểm lệch với yêu cầu nghiệm thu mới (cần xử lý trước khi mở lại deploy)

1. **Ẩn mẫu cũ is GLOBAL:** `isLegacyTemplateSelectable()` trong `src/server/work-catalog.ts` trả `false` cho mọi người dùng khi có bất kỳ phiên bản TX `ACTIVE` nào (và chưa có cấu hình ghi đè). Yêu cầu mới: bộ phận B chưa kích hoạt vẫn phải chọn được nguồn hợp lệ; không ẩn toàn hệ thống chỉ vì bộ phận A kích hoạt. Hiện chưa đủ dữ kiện ánh xạ để làm theo bộ phận; cần chọn giải pháp (per-department hoặc chỉ ẩn khi quản trị bật).
2. **Hạn xử lý sau khi kế hoạch đã duyệt:** API PATCH hiện vẫn cho sửa `due_date` sau duyệt (chỉ ghi audit, không cần lý do/người xác nhận). Yêu cầu mới: tạm khóa thao tác sửa hạn sau duyệt nếu chưa có quy trình gia hạn đầy đủ.

## 8. Kết luận

- Lịch sử migration Production **không đáng tin cậy để dùng `prisma migrate deploy`**; đã thay bằng apply-script idempotent và kiểm thử trên clone cấu trúc Production (PASS).
- **DỪNG triển khai** theo đúng điều kiện an toàn của yêu cầu: Storage chưa đạt + ánh xạ bộ phận chưa xác nhận.
- Không merge `main`, không push, không DDL Production trong lượt này.

## 9. Việc cần làm để mở lại deploy

1. Cấp quyền/khóa bí mật để tạo bucket minh chứng **riêng tư** (`work-evidence`) + policy tối thiểu cho server; bật `SUPABASE_EVIDENCE_BUCKET` trên Vercel.
2. Hải quan xác nhận ánh xạ 6 khối bộ phận → `org_units` (đặc biệt CNTT, Điều tra CBL, Công tác Đảng).
3. Chốt phương án kích hoạt danh mục theo bộ phận (không ẩn mẫu cũ toàn hệ thống).
4. Chốt chính sách hạn sau duyệt (khóa tạm hoặc quy trình gia hạn có lý do + người xác nhận).
5. Sau đó: backup Production mới → áp `scripts/apply-yc31-32-ddl.ts` → deploy code → smoke test → mới import danh mục TX.
