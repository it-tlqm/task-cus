# BÁO CÁO SẴN SÀNG PHÁT HÀNH — YC-31/32 (20/10/2026)

- **Trạng thái: HOLD.** Chưa chạy DDL, chưa merge/push, chưa deploy Production.
- Phạm vi: YC-31 (Danh mục công việc thường xuyên — TX) và YC-32 (đầu việc cá nhân, hạn xử lý, ngày hoàn thành, minh chứng).
- Nhánh: `feat/yc31-32-work-catalog-evidence`, HEAD `b56ed48`.
- Điều kiện mở cổng: người dùng xác nhận đã cấu hình xong bucket private + biến môi trường server-side trên Supabase/Vercel.

---

## 1. Đối chiếu nhánh với `origin/main`

Đã chạy `git fetch origin main` (chỉ đọc remote, không push):

| Hạng mục | Kết quả |
|---|---|
| HEAD | `b56ed48` |
| `origin/main` | `b65f104` |
| Quan hệ | **ahead 10, behind 0** |
| Commit gần nhất | `feat(yc31-32): kich hoat TX theo bo phan, khoa han sau duyet, minh chung private` |
| Working tree | Chỉ còn các tệp local/demo cố ý không commit (gói tài liệu, script demo, `.zip`) |

Diff `origin/main...HEAD`: **31 tệp**, 5.488 dòng thêm, 128 dòng bớt.

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

Script `scripts/apply-yc31-32-ddl.ts` dùng `IF NOT EXISTS`, không xóa bảng/cột, báo cáo fingerprint schema. Lần chạy cuối trên bản sao cấu trúc Production (`talung_prodclone`, PostgreSQL cục bộ):

```text
DDL-DONE (executed_statements=17, skipped_constraints=10,
          schema_changed=false,
          schema_before=cd4cfb9eb26d,
          schema_after=cd4cfb9eb26d,
          checks_failed=0)
SCHEMA-UNCHANGED
```

Bằng chứng idempotent đầy đủ vẫn là lần đầu trên clone: `schema_changed=true`, fingerprint `648b5f3e4851 → cd4cfb9eb26d`; lần hai `schema_changed=false`. Không dùng con số `executed_statements` để kết luận.

**Chưa chạy DDL này trên Production.**

## 4. Production read-only (20/10/2026)

Chỉ đọc, không ghi:

| Hạng mục | Kết quả |
|---|---|
| `https://task-cus.vercel.app/api/health` | `status=ok`, `db=up`, `commit=b65f104`, `env=production` (10:17 giờ Việt Nam) |
| Supabase project | `ekswvjbpqblssxcdwagi.supabase.co` |
| `public._prisma_migrations` | **NULL — không tồn tại** |
| Bucket `work-evidence` | **Chưa có** |
| Bucket `task-attachments` | `public=true`, giới hạn 50 MB, 7 MIME, **2 object** |
| Policy public trên `task-attachments` | 4 policy role `public`: SELECT, INSERT, UPDATE, DELETE |

Vì `_prisma_migrations` không tồn tại: **tuyệt đối không chạy `prisma migrate deploy`** trên Production. Chỉ dùng script apply additive đã kiểm chứng.

## 5. Code mới khi chưa kích hoạt nhóm TX nào

Đã chạy lại trên local production build. API quản trị trả đủ 6 nhóm nguồn, **0 nhóm active** (DB có 2 dòng mapping được tạo tường minh, cả hai đều inactive; 4 nhóm còn lại chưa có dòng mapping và mặc định là chưa kích hoạt). Local có 1 phiên bản TX ACTIVE nhưng không mapping nào được bật:

| Tài khoản | TX hiển thị | Mẫu cũ chọn được | Trạng thái kích hoạt |
|---|---:|---|---|
| Cán bộ A | 0 | Có | `NOT_ACTIVATED` |
| Cán bộ B | 0 | Có | `NOT_ACTIVATED` |
| Quản trị mapping | 6 nhóm, **0 active** | — | — |

Kết luận: khi chưa có nhóm nào được kích hoạt, hệ thống **không phát TX**, không tự ẩn 48 mẫu cũ, và không đẩy danh mục chưa xác nhận cho cán bộ.

## 6. Rủi ro `task-attachments` — tách khỏi đợt này

Đây là rủi ro **CAO** nhưng **không sửa trong đợt YC-31/32**. Chi tiết và kế hoạch riêng:

- `docs/TASK_ATTACHMENTS_PRIVATE_PLAN_2026-10-20.md`

Tóm tắt: bucket đang public; publishable key nằm trong trình duyệt; 4 policy public cho phép đọc/ghi/ghi đè/xóa object; URL public đi thẳng, bỏ qua kiểm tra quyền của ứng dụng; chưa có audit tải tệp. Không đổi policy/bucket trong đợt này vì còn 2 object/URL cũ.

## 7. Điều kiện còn chặn và tài liệu thao tác

**Chưa thể deploy/kích hoạt vì:**

1. **Deploy nền tảng:** chưa có backup Production mới + checksum + phương án restore đã kiểm tra; chưa có phê duyệt merge/push/DDL.
2. **Tính năng minh chứng:** chưa có bucket private `work-evidence` + service/secret key server-side.
3. **Kích hoạt danh mục TX:** ba nhóm chưa có `org_units` tương ứng và ba nhóm còn lại chưa được Hải quan xác nhận mapping. **Mapping không chặn deploy code nền tảng**; chỉ chặn import/kích hoạt. Nhóm chưa xác nhận phải giữ inactive.
4. `task-attachments` vẫn public — xử lý ở đợt riêng, không trộn vào đợt này.
5. Chưa có quy trình gia hạn hạn sau duyệt; hiện khóa 403 (hạn chế đã biết, không chặn deploy).

Tài liệu thao tác:

- Checklist ngắn: `docs/DEPLOY_CHECKLIST_YC31_YC32_2026-10-20.md`
- Smoke test sau cấu hình Storage: `docs/SMOKE_TEST_YC31_YC32_2026-10-20.md`
- Kế hoạch riêng cho bucket public: `docs/TASK_ATTACHMENTS_PRIVATE_PLAN_2026-10-20.md`

## 8. Kết luận

- Không có thay đổi Production trong lượt rà soát này.
- Không có thay đổi ngoài YC-31/32.
- Mã đã sẵn sàng về mặt build/typecheck/hồi quy, nhưng **cổng triển khai vẫn đóng** cho tới khi Storage được cấu hình và backup/restore được xác nhận.
- Mapping chưa xác nhận **không chặn deploy code nền tảng**; chỉ chặn import/kích hoạt danh mục. Nhóm chưa xác nhận phải giữ inactive.
- **DỪNG trước DDL và merge/push** cho tới khi người dùng xác nhận hoàn tất cấu hình Storage.
