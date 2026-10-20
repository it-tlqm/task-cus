# KIỂM TRA PRODUCTION TRƯỚC TRIỂN KHAI YC-31 + YC-32 (20/10/2026)

> **CẬP NHẬT CUỐI NGÀY:** báo cáo dưới đây là audit **trước** triển khai. Sau đó đã backup/restore, áp DDL additive, merge `eee6321`, deploy Production và smoke **55/55 API + 14/14 UI**. Production hiện `db=up`, `commit=eee6321`; dữ liệu nền không đổi; TX vẫn **chưa import/kích hoạt** (0 version/0 entry/0 mapping).
>
> Kết quả cuối: `work-evidence` private/4 MB/0 object/0 policy; `task-attachments` public/2 object/4 policy — **không sửa**. Audit 1.013 bản ghi (tăng do test, không xóa). Không có 5xx/runtime error trong cửa sổ kiểm tra.

Phạm vi: chỉ ĐỌC Production (Supabase `ekswvjbpqblssxcdwagi` + Vercel `task-cus.vercel.app`) trong lượt audit ban đầu.
Không chạy DDL, không ghi dữ liệu, không merge/push trong lượt audit này; các thao tác triển khai được thực hiện sau đó theo checklist.

## 1. Lịch sử migration Production

- `_prisma_migrations`: **KHÔNG tồn tại** (kiểm tra `to_regclass('public._prisma_migrations')` → NULL; kiểm tra lại read-only ngày 20/10/2026 vẫn NULL).
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
- **Đã chạy trên Production sau audit:** lần 1 `executed_statements=27`, `schema_changed=true`, fingerprint `f7964d26aa6e → cd4cfb9eb26d`; lần 2 `schema_changed=false`, cùng fingerprint, 11 constraint bỏ qua; `checks_failed=0` cả hai lần. Sau DDL có 65 bảng public; 4 bảng mới rỗng; baseline không đổi.

## 5. Storage Production — ĐÃ ĐẠT SAU CẤU HÌNH (mã fail-closed)

- Bucket hiện có duy nhất: `task-attachments`.
  - `public = true`; giới hạn 50 MB; MIME: PDF/JPEG/PNG/XLSX/DOCX/DOC/XLS; **2 object**.
  - 4 policy role `public`: SELECT, INSERT, UPDATE, DELETE trên `bucket_id='task-attachments'`.
  - Tên policy: `Allow public select on task-attachments`, `Allow public insert on task-attachments`, `Allow public update on task-attachments`, `Allow public delete on task-attachments`.
  - Rủi ro cao: người có publishable key (nằm trong trình duyệt) có thể đọc/ghi đè/xóa object. Không thay đổi bucket này trong đợt hiện tại vì còn object/URL cũ; phải kiểm kê và chuyển URL trước.
  - Kế hoạch khắc phục riêng: `docs/TASK_ATTACHMENTS_PRIVATE_PLAN_2026-10-20.md`.
- **Bucket `work-evidence` đã tạo trên Production:** `public=false`, giới hạn 4.194.304 bytes, **0 object, 0 policy**; anonymous upload 403, public read 404.
- **Đã cấu hình server-side trên Vercel Production:** `SUPABASE_SECRET_KEY`, `STORAGE_DRIVER`, `SUPABASE_EVIDENCE_BUCKET`, `WORK_EVIDENCE_MAX_MB` (type `sensitive`; không đọc/in giá trị). `NEXT_PUBLIC_SUPABASE_URL`/publishable key không có trong env, code dùng fallback hiện hữu; upload/download thực tế đã PASS.
- Mã vòng 2 đã **fail-closed**: thiếu khóa server, thiếu bucket, bucket public hoặc driver R2 chưa cấu hình → **503**, không fallback publishable key/URL công khai. `STORAGE_DRIVER=local` cũng bị từ chối cho minh chứng trong production (trừ cờ `ALLOW_LOCAL_EVIDENCE=1` chỉ dùng kiểm thử). Đã kiểm thử 7 tình huống, 7/7 PASS; smoke Production xác nhận 401/403/404/413/423.
- Kết luận: **tính năng minh chứng đã được bật an toàn**; không thay đổi bucket `task-attachments`.

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
3. **Minh chứng** → đã tách kho private + fail-closed; bucket `work-evidence` và khóa server-side đã cấu hình; smoke upload/download/delete/403/401/404/413/423 PASS.

Các điểm trên đã được xử lý và nghiệm thu trên Production; TX vẫn chờ mapping để import/kích hoạt.

## 8. Kết luận

- Lịch sử migration Production **không đáng tin cậy để dùng `prisma migrate deploy`**; đã thay bằng apply-script idempotent và kiểm thử trên clone + Production (PASS, fingerprint không đổi ở lần 2).
- Mã vòng 2 đã xử lý 3 điểm lệch: kích hoạt theo bộ phận, khóa hạn sau duyệt, kho minh chứng private/fail-closed.
- **Đã triển khai code Production** sau khi Storage, backup/restore và DDL đạt: commit `eee6321`, health `db=up`; smoke API 55/55, UI 14/14.
- Dữ liệu nền không mất; 48 mẫu cũ/YC-25/QĐ1277 giữ nguyên; 4 bảng mới rỗng.
- Ánh xạ bộ phận chưa xác nhận **chặn import/kích hoạt danh mục TX**, không chặn code nền tảng; nhóm chưa xác nhận phải giữ inactive.

## 9. Việc cần làm tiếp

1. Hải quan xác nhận ánh xạ 3 nhóm còn chờ: Nghiệp vụ Hải quan (73), TH & Báo cáo (42), Phúc tập & KT STQ (2). Ba nhóm CNTT (5), điều tra CBL (13), Công tác Đảng (8) không có `org_units` — giữ UNACTIVATED, không tự tạo đơn vị.
2. Import dry-run, đối chiếu 143 dòng, bật mapping đúng đơn vị; chạy lại S-20→S-25 và S-80→S-84 trước khi phát danh mục.
3. Chốt quy trình gia hạn hạn xử lý sau duyệt (hiện khóa 403; chưa có workflow).
4. Xử lý `task-attachments` theo kế hoạch riêng; không trộn vào đợt này.
5. Theo dõi log/5xx và kiểm tra định kỳ object `work-evidence` không bị public/policy phát sinh.
