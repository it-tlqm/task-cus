# BÁO CÁO SẴN SÀNG PHÁT HÀNH — YC-31/32 (20/10/2026)

- **Trạng thái: ĐÃ DEPLOY CODE — SMOKE PASS 55/55 — TX CHƯA KÍCH HOẠT.**
- Phạm vi: YC-31 (Danh mục công việc thường xuyên — TX) và YC-32 (đầu việc cá nhân, hạn xử lý, ngày hoàn thành, minh chứng).
- Nhánh: `feat/yc31-32-work-catalog-evidence` đã merge vào `main` tại `eee6321`; push `origin/main` thành công.
- Production: `https://task-cus.vercel.app`; deployment `task-ed2wh92xn-tlqm.vercel.app`; `/api/health` trả `db=up`, `commit=eee6321`.
- Kết quả: backup + restore kiểm chứng; DDL additive PASS; smoke API **55/55 PASS**; UI desktop/mobile **14/14 PASS**.
- Giới hạn có chủ đích: **chưa import danh mục TX**, chưa bật mapping nhóm nào; 48 mẫu cũ vẫn hoạt động; `task-attachments` không thay đổi.

> Báo cáo giữ bối cảnh kiểm tra trước deploy ở mục 1-3 để đối chiếu; trạng thái cuối nằm ở mục 0 và mục 4-8.

## 0. Kết quả cuối (20/10/2026)

| Hạng mục | Kết quả |
|---|---|
| Commit deploy | `eee6321` (merge YC-31/32) |
| Health | `status=ok`, `db=up`, `commit=eee6321`, `env=production` |
| Backup | `prod-full.dump`, 960.851 bytes, SHA-256 `30BB27BC...B2482`; restore `talung_restore_yc31_32` khớp 61/61 bảng |
| DDL Production | lần 1 `executed_statements=27`, `schema_changed=true`, `f7964d26aa6e → cd4cfb9eb26d`, `checks_failed=0`; lần 2 `schema_changed=false`, cùng fingerprint, 11 constraint bỏ qua, `checks_failed=0` |
| Bảng sau DDL | 65 bảng public; 4 bảng mới đều rỗng (`work_catalog_versions`, `work_catalog_entries`, `work_catalog_department_mappings`, `work_evidences`) |
| Dữ liệu nền | 24 người, 24 tài khoản, 26 đầu việc cá nhân, 15 kết quả tháng, 18 nhiệm vụ, 48 mẫu, 3 đầu việc bộ phận, 3.386 sản phẩm, 8 đơn vị |
| Audit | 1.013 bản ghi; tăng từ 954 do smoke/UI, **không xóa** |
| Smoke API | `YC3132PROD-20261020061922`: 55/55 PASS, `cleanupErrors=[]` |
| UI | 14/14 PASS trên desktop + mobile; không console error/pageerror |
| Storage | `work-evidence`: private, 4 MB, 0 object, 0 policy; `task-attachments`: public, 2 object, 4 policy public — **không sửa** |
| TX | 0 version, 0 entry, 0 mapping; tất cả nhóm còn UNACTIVATED |

---

## 1. Đối chiếu nhánh với `origin/main`

Trước merge đã chạy `git fetch origin main`; sau khi DDL/smoke PASS đã push `b65f104..eee6321`:

| Hạng mục | Kết quả |
|---|---|
| HEAD nhánh trước merge | `b56ed48` |
| `main` sau merge | `eee6321` |
| `origin/main` | `eee6321` (đã push `b65f104..eee6321`) |
| Commit tài liệu phát hành | `59365e4` |
| Working tree | Chỉ còn các tệp local/demo cố ý không commit (gói tài liệu, script demo, `.zip`) |

Diff nhánh `origin/main...HEAD` trước merge: **31 tệp**, 5.488 dòng thêm, 128 dòng bớt; toàn bộ thuộc YC-31/32.

## 2. Xác minh phạm vi thay đổi

Toàn bộ 31 tệp thuộc một trong các nhóm sau:

- Schema/DDL: `prisma/schema.prisma`, migration YC-31/32, `scripts/apply-yc31-32-ddl.ts`.
- API: danh mục TX, mapping/kích hoạt, minh chứng, đầu việc cá nhân, liên kết nhiệm vụ, kết quả tháng.
- Server: `work-catalog.ts`, `work-access.ts`, `work-dates.ts`, `work-evidence.ts`, `storage.ts`.
- UI: tab quản trị danh mục TX, `/plans`, `/my-work`, `/monthly-results`, `/admin/catalog`.
- Tài liệu và cấu hình: handover, audit, mapping, `.gitignore`, giới hạn body 25 MB.

Đã kiểm tra chéo:

- Không có tệp Sidebar/layout/điều hướng bị sửa.
- Không có mã hoặc UI YC-33 → YC-37.
- Từ khóa `YC-33…YC-37`/`sidebar` chỉ xuất hiện trong phần phạm vi của tài liệu, không có thay đổi chức năng.
- Không có thay đổi nào ngoài YC-31/32 trong diff.

## 3. Migration additive và script DDL

Nguồn: `prisma/migrations/20261021100000_yc31_yc32_work_catalog_evidence/migration.sql`.

Đã rà soát:

- Chỉ có `ALTER TABLE ... ADD COLUMN` cho 4 cột **nullable** của `personal_work_items`.
- Chỉ có `CREATE TABLE`, `CREATE INDEX`, `CREATE UNIQUE INDEX`, `ADD CONSTRAINT`.
- Không có `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `SET NOT NULL`, `ALTER COLUMN`.
- Các cụm `ON DELETE` chỉ là hành vi của khóa ngoại, không xóa dữ liệu hiện có.

Script `scripts/apply-yc31-32-ddl.ts` dùng `IF NOT EXISTS`, không xóa bảng/cột, báo cáo fingerprint schema. Đã chạy trên Production ngày 20/10/2026:

```text
Lần 1:
DDL-DONE (executed_statements=27, schema_changed=true,
          schema_before=f7964d26aa6e,
          schema_after=cd4cfb9eb26d,
          checks_failed=0)

Lần 2 (idempotent):
DDL-DONE (skipped_constraints=11,
          schema_changed=false,
          schema_before=cd4cfb9eb26d,
          schema_after=cd4cfb9eb26d,
          checks_failed=0)
SCHEMA-UNCHANGED
```

Sau DDL: 65 bảng public (tăng 4), các bảng mới rỗng, baseline nghiệp vụ không đổi. Không chạy `prisma migrate deploy`; không áp drift cũ ngoài YC-31/32.

## 4. Trạng thái Production sau triển khai (20/10/2026)

Các chỉ số dưới đây được đọc lại sau deploy/DDL, không thay đổi dữ liệu:

| Hạng mục | Kết quả |
|---|---|
| `https://task-cus.vercel.app/api/health` | `status=ok`, `db=up`, `commit=eee6321`, `env=production` (sau deploy) |
| Supabase project | `ekswvjbpqblssxcdwagi.supabase.co` |
| `public._prisma_migrations` | **NULL — vẫn không tồn tại** |
| Bucket `work-evidence` | `public=false`, giới hạn 4.194.304 bytes, **0 object, 0 policy** |
| Bucket `task-attachments` | `public=true`, giới hạn 50 MB, 7 MIME, **2 object** (không đổi) |
| Policy public trên `task-attachments` | 4 policy role `public`: SELECT, INSERT, UPDATE, DELETE (không đổi) |

Vì `_prisma_migrations` không tồn tại: **tuyệt đối không chạy `prisma migrate deploy`** trên Production. Chỉ dùng script apply additive đã kiểm chứng.

## 5. Code mới khi chưa kích hoạt nhóm TX nào

Production **chưa import danh mục TX**: `work_catalog_versions=0`, `work_catalog_entries=0`, `work_catalog_department_mappings=0`. Vì chưa có phiên bản nên trạng thái trả về là `NO_VERSION` (tương đương không có TX khả dụng), không phải `NOT_ACTIVATED`; cả hai đều không phát TX.

| Tài khoản | TX hiển thị | Mẫu cũ chọn được | Trạng thái |
|---|---:|---|---|
| Cán bộ A (`democb01`) | 0 | Có (48 mẫu) | `NO_VERSION` |
| Cán bộ B (`democb02`) | 0 | Có (48 mẫu) | `NO_VERSION` |
| Quản trị mapping | 0 nhóm nguồn (chưa có version), 0 mapping/0 active | — | — |

Kết luận: hệ thống **không phát TX**, không tự ẩn 48 mẫu cũ, và không đẩy danh mục chưa xác nhận cho cán bộ. Smoke xác nhận quản trị mapping chỉ mở cho lãnh đạo; cán bộ thường nhận 403.

## 6. Rủi ro `task-attachments` — tách khỏi đợt này

Đây là rủi ro **CAO** nhưng **không sửa trong đợt YC-31/32**. Chi tiết và kế hoạch riêng:

- `docs/TASK_ATTACHMENTS_PRIVATE_PLAN_2026-10-20.md`

Tóm tắt: bucket đang public; publishable key nằm trong trình duyệt; 4 policy public cho phép đọc/ghi/ghi đè/xóa object; URL public đi thẳng, bỏ qua kiểm tra quyền của ứng dụng; chưa có audit tải tệp. Không đổi policy/bucket trong đợt này vì còn 2 object/URL cũ.

## 7. Điều kiện còn chặn và tài liệu thao tác

**Đã hoàn tất:** deploy code nền tảng, DDL additive, backup/restore, bucket private, khóa hạn sau duyệt, smoke API/UI.

**Còn chặn việc import/kích hoạt TX:**

1. **Mapping chưa xác nhận:** `Bộ phân Nghiệp vụ Hải quan` (73 dòng), `Bộ phân TH & Báo cáo` (42), `Bộ phân Phúc tập & KT STQ` (2) chờ Hải quan chốt `org_units`.
2. **Không có `org_units` tương ứng:** `Bộ phận CNTT` (5), `Bộ phân điều tra CBL` (13), `Công tác Đảng` (8) — phải giữ UNACTIVATED, không tự tạo đơn vị.
3. **Chưa có phiên bản TX:** 0 version/0 entry/0 mapping; không được import toàn bộ 143 dòng hoặc kích hoạt đại trà.
4. **`task-attachments` vẫn public** — xử lý ở đợt riêng, không trộn vào đợt này.
5. **Chưa có quy trình gia hạn hạn sau duyệt** — hiện khóa 403; tiến độ/ngày hoàn thành thực tế vẫn sửa được.
6. **Giới hạn 4 MB** do Vercel request-body ~4,5 MB; muốn tăng cần direct upload.

Tài liệu thao tác:

- Checklist ngắn: `docs/DEPLOY_CHECKLIST_YC31_YC32_2026-10-20.md`
- Smoke test và kết quả 55/55: `docs/SMOKE_TEST_YC31_YC32_2026-10-20.md`
- Kế hoạch riêng cho bucket public: `docs/TASK_ATTACHMENTS_PRIVATE_PLAN_2026-10-20.md`

## 8. Kết luận

- **Code YC-31/32 đã được deploy Production** tại `eee6321`; `/api/health` xanh, không có 5xx/runtime error trong cửa sổ kiểm tra.
- DDL additive đã áp thành công và idempotent; **không có mất dữ liệu**; 48 mẫu cũ, YC-25 và dữ liệu QĐ1277 giữ nguyên.
- Minh chứng đã chạy private/fail-closed trên Production: upload/download/xóa/403/401/404/413/423 đều PASS; không lộ URL public hoặc storage key.
- **TX vẫn chưa được kích hoạt**: 0 version/0 entry/0 mapping; 143 dòng nguồn chưa import. Chỉ import/kích hoạt sau khi Hải quan xác nhận mapping và có `org_units` phù hợp.
- `task-attachments` chưa được sửa; rủi ro public được theo dõi ở kế hoạch riêng.
- Nếu có sự cố nghiêm trọng: rollback code về `b65f104`; schema additive có thể giữ nguyên.
