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
- Bảng mới: `work_catalog_versions`, `work_catalog_entries`, `work_catalog_department_mappings`, `work_evidences`.
- `work_catalog_department_mappings` (vòng 2): unique `department`; `unit_id` nullable; `is_active` mặc định `false`; CHECK `is_active = false OR unit_id IS NOT NULL`; FK tới `org_units`.
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
- Kết quả trên clone **sau khi bổ sung bảng mapping vòng 2**:

| Lần chạy | `executed_statements` | `skipped_constraints` | `schema_changed` | Fingerprint schema |
|---|---:|---:|---|---|
| 1 | 19 | 8 | **true** | `648b5f3e4851` → `cd4cfb9eb26d` |
| 2 | 17 | 10 | **false** | `cd4cfb9eb26d` (giữ nguyên) |

- `executed_statements` chỉ là số câu lệnh đã chạy. Ở lần 2, 17 câu `IF NOT EXISTS` chạy nhưng **không tạo thay đổi nào**; 10 ràng buộc được kiểm tra rồi bỏ qua. Bằng chứng idempotent là **fingerprint trước = sau** và `schema_changed=false`, không dùng con số `executed` để kết luận.
- `checks_failed=0` cả hai lần.
- Kiểm thử ràng buộc unique trên clone: nhiều dòng cùng người với `work_item_id = NULL` chèn được; dòng thứ hai cùng `(person, work_item)` bị từ chối bằng `23505`; transaction đã rollback.
- Diff còn lại giữa clone và schema chỉ là drift cũ (mục 2.1), **không còn mục YC-31/32**.
- **Chưa chạy DDL này trên Production.**

## 5. Storage Production — CHƯA ĐẠT (mã đã fail-closed)

- Bucket hiện có duy nhất: `task-attachments`.
  - `public = true`; giới hạn 50 MB; MIME: PDF/JPEG/PNG/XLSX/DOCX/DOC/XLS; **2 object**.
  - 4 policy role `public`: SELECT, INSERT, UPDATE, DELETE trên `bucket_id='task-attachments'`.
  - Rủi ro cao: người có publishable key (nằm trong trình duyệt) có thể đọc/ghi đè/xóa object. Không thay đổi bucket này trong đợt hiện tại vì còn object/URL cũ; phải kiểm kê và chuyển URL trước.
- **Không có bucket `work-evidence`** (GET bucket → NoSuchBucket).
- Môi trường hiện tại **không có `SUPABASE_SERVICE_ROLE_KEY`/secret key**.
- Mã vòng 2 đã **fail-closed**: thiếu khóa server, thiếu bucket, bucket public hoặc driver R2 chưa cấu hình → **503**, không fallback publishable key/URL công khai. `STORAGE_DRIVER=local` cũng bị từ chối cho minh chứng trong production (trừ cờ `ALLOW_LOCAL_EVIDENCE=1` chỉ dùng kiểm thử). Đã kiểm thử 7 tình huống, 7/7 PASS.
- Kết luận: **không được deploy tính năng minh chứng** cho tới khi tạo bucket private + cấu hình khóa server-side trên Vercel.

## 6. Ánh xạ bộ phận của Danh mục TX — CHƯA ĐỦ ĐIỀU KIỆN IMPORT

- File nguồn: 143 đầu việc / 6 khối, khớp bản nhập local: 73 / 5 / 13 / 2 / 42 / 8.
- Trong DB hiện tại, toàn bộ 143 dòng có `unit_id = NULL` (chưa gán đơn vị).
- Đối chiếu tên khối trong file với `org_units` Production:
  - `Bộ phân Nghiệp vụ Hải quan` (73): cần xác nhận có phải `BP_NGHIEPVU_A` không.
  - `Bộ phân TH & Báo cáo` (42): cần xác nhận có phải `BP_TONGHOP_D` không.
  - `Bộ phân Phúc tập & KT STQ` (2): tên gần với mã đơn vị `BỘ PHẬN PHÚC TẬP _ KTSTQ` (name hiển thị "Tổng hợp") — cần xác nhận.
  - `Bộ phận CNTT` (5), `Bộ phân điều tra CBL` (13), `Công tác Đảng` (8): **không có đơn vị tương ứng** trong `org_units`.
- Vì vậy **không import danh mục TX vào Production** cho tới khi Hải quan xác nhận (câu hỏi B2).
- Vòng 2 đã thêm `WorkCatalogDepartmentMapping` để kích hoạt theo bộ phận, không sửa `unit_id` của 143 dòng nguồn:
  - unique `department`;
  - `unit_id` nullable;
  - `is_active=false` mặc định;
  - CHECK không cho active khi thiếu đơn vị;
  - mọi thay đổi qua API quản trị có audit.
- Bảng 3 cột để xác nhận: `docs/TX_DEPARTMENT_MAPPING_2026-10-20.md`.
- Ba nhóm không có `org_units` tương ứng phải giữ **UNACTIVATED**; không tự tạo đơn vị, không phát cho toàn bộ cán bộ.

## 7. Điểm lệch với yêu cầu nghiệm thu mới — ĐÃ XỬ LÝ TRONG MÃ (vòng 2)

1. **Ẩn mẫu cũ toàn hệ thống** → đã chuyển sang **theo bộ phận**:
   - mapping `WorkCatalogDepartmentMapping` + entry ACTIVE của phiên bản đang áp dụng;
   - chỉ bộ phận đã kích hoạt mới ẩn 48 mẫu cũ;
   - bộ phận chưa kích hoạt vẫn dùng 48 mẫu cũ/YC-25;
   - kiểm tra theo phân công của **người nhận**, không theo phạm vi người tạo;
   - đã kiểm thử A/B với hai trạng thái kích hoạt khác nhau (50/50 API, UI thật).
2. **Hạn xử lý sau duyệt** → đã **khóa**:
   - PATCH `dueDate` sau duyệt → **403**, audit `PERSONAL_WORK_ITEM_DUE_DATE_DENIED`;
   - tiến độ/ngày hoàn thành thực tế vẫn cập nhật được;
   - không ghi đè hạn lịch sử;
   - chưa có quy trình gia hạn được duyệt.
3. **Minh chứng** → đã tách kho private + fail-closed; chưa cấu hình bucket/khóa trên Production nên tính năng vẫn bị chặn deploy.

Các điểm trên không còn là lý do chặn **mã nguồn**, nhưng vẫn là điều kiện **nghiệm thu/cấu hình** trước khi bật Production.

## 8. Kết luận

- Lịch sử migration Production **không đáng tin cậy để dùng `prisma migrate deploy`**; đã thay bằng apply-script idempotent và kiểm thử trên clone cấu trúc Production (PASS, fingerprint không đổi ở lần 2).
- Mã vòng 2 đã xử lý 3 điểm lệch: kích hoạt theo bộ phận, khóa hạn sau duyệt, kho minh chứng private/fail-closed.
- **DỪNG triển khai Production** theo đúng điều kiện an toàn: Storage chưa đạt + ánh xạ bộ phận chưa xác nhận + chưa có backup/checksum/restore plan mới.
- Không merge `main`, không push, không DDL/import/Storage Production trong lượt này.

## 9. Việc cần làm để mở lại deploy

1. Tạo bucket minh chứng **riêng tư** `work-evidence` + cấu hình `SUPABASE_SERVICE_ROLE_KEY`/secret key **server-side** trên Vercel; không thêm policy public; đặt `WORK_EVIDENCE_MAX_MB=4` (Vercel ~4,5 MB).
2. Hải quan xác nhận ánh xạ 6 nhóm nguồn → `org_units` theo bảng 3 cột (đặc biệt CNTT, Điều tra CBL, Công tác Đảng).
3. Chốt quy trình gia hạn hạn xử lý sau duyệt (hiện đang khóa 403; chưa có workflow gia hạn).
4. Backup Production mới + checksum + kiểm tra restore.
5. Review/merge nhánh; build/typecheck xanh.
6. Áp `scripts/apply-yc31-32-ddl.ts` (KHÔNG `prisma migrate deploy`), chạy lại xác nhận `schema_changed=false`/fingerprint không đổi.
7. Deploy code → `/api/health` đúng commit, `db=up`; smoke test.
8. Chỉ sau đó mới import TX cho nhóm đã xác nhận, dry-run + đối chiếu 143 dòng, rồi bật mapping.
