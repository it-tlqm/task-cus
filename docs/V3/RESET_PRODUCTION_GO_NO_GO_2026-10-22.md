# GO/NO-GO — LÀM SẠCH TOÀN DIỆN PRODUCTION (V3)

**Ngày:** 22/10/2026 · **Production:** https://task-cus.vercel.app · **Code đang chạy:** `6cce5f9`
**Quyết định phạm vi:** khởi tạo mới hoàn toàn dữ liệu vận hành — bỏ toàn bộ nghiệp vụ cũ.

> **Trạng thái: GO — DỪNG trước lệnh EXECUTE.** Chủ dự án phát lệnh riêng.

---

## 1. PHẠM VI ĐÃ THỰC HIỆN (chuẩn bị)

| Nhóm | Kết quả |
|---|---|
| Mã nguồn | Giữ nguyên V3, đã deploy `da9cbb3` + `6cce5f9` (kho tệp private + Super Admin) |
| Kho tệp `task-attachments` | **PRIVATE**: route có xác thực `/api/tasks/{id}/attachments/{aid}/file` (401/403/200 + audit), **không còn URL công khai** trong payload API, upload trả `url=""` |
| Super Admin | 1 tài khoản `admin.tk` (không gắn đơn vị, không có `plans.approve`, có `system.config` + `users.manage` + `org.manage` + `catalog.manage` + `audit.view`), **bắt buộc đổi mật khẩu lần đầu** (`must_change_password` + middleware + trang `/change-password`) |
| Khôi phục quản trị | `scripts/admin-account.mjs` — `status` / `create` / `reset-password` / `unlock`, **độc lập** với script reset, có audit + mã xác nhận + file credential git-ignored + ACL |
| Script reset | Ma trận bảng mở rộng (thêm `work_evidences`, `work_evidence_adjustments`, `person_supervisions`, `meeting_conclusions`, `duty_positions`, `audit_events`); TX lấy từ **file đối chiếu 320 mã**; nghiệm thu tự động (0 nghiệp vụ + dữ liệu nền đủ + đúng 1 tài khoản) |
| Kho lưu trữ | `scripts/archive-production.mjs` (DB + schema DDL + tệp + manifest + checksum); `scripts/purge-storage.mjs` (dọn kho tệp, có `--dry-run`) |
| Preflight | `reset-and-init.mjs --preflight=1` — 14 kiểm tra an toàn, kết quả **GO** (`demo-ops/reset/preflight-2026-10-22-06-45-50.json`) |

## 2. DỮ LIỆU SẼ BỊ XOÁ (toàn bộ nghiệp vụ cũ)

Kế hoạch · nhiệm vụ (giao/phát sinh/đã xong) · đầu việc · nhật ký công việc · nhật ký tác nghiệp · nhật ký ca trực · bản ghi giao ban/báo cáo/biên bản · hồ sơ báo hoàn thành–xác nhận–trả lại–phê duyệt · SP QĐ1277 gắn công việc cũ · minh chứng & tệp đính kèm · kết quả tháng · bảng điểm · báo cáo tổng hợp · thông báo & hàng đợi · dữ liệu DEMO/UAT · **toàn bộ tài khoản cũ (24 tài khoản, gồm tài khoản cán bộ thật)** · **tuyến phê duyệt** · **audit cũ** (đã lưu trữ trước).

## 3. DỮ LIỆU NỀN ĐƯỢC GIỮ / NẠP LẠI

| Dữ liệu | Nguồn | Kết quả rehearsal |
|---|---|---|
| 8 đơn vị | Excel "Cơ cấu tổ chức" (`docs/Dữ liệu-file-hải-quân-gửi/Danh sách.xlsx`) | ✅ 8 |
| 35 hồ sơ nhân sự | Excel "Danh sách" | ✅ 35 (không tạo tài khoản cho cán bộ) |
| 320 mã TX | `demo-ops/reset/reconciliation/tx-348-dong-320-ma.csv` (348−28, sha256 ghi trong manifest) | ✅ 320 (141 hệ số NULL) |
| 3.386 SP + 80 nhóm QĐ1277 | DB nguồn đã kiểm chứng (`qd1277-3386-san-pham.csv` + sha256) — **ghi rõ nguồn & trạng thái chờ đối chiếu file gốc** | ✅ 3.386 / 80 (548 hệ số NULL, **không suy luận**) |
| Vai trò · quyền · cấu hình nền V3 | copy từ DB nguồn | ✅ (roles 4 · permissions 12 · role_permissions 33) |
| 1 Super Admin | tạo mới trong script reset, mật khẩu ngẫu nhiên, `mustChangePassword=true` | ✅ |

## 4. REHEARSAL (đã chạy, PASS)

* DB riêng `talung_reset_rehearsal` dựng từ **bản backup Production mới nhất** (restore 7.598 dòng, 0 bảng thiếu).
* Chạy `reset-and-init.mjs --mode=rehearsal` **2 lần** (idempotent) → `KET QUA: PASS`.
* Trạng thái cuối: `plans 0 · tasks 0 · personal_work_items 0 · routine_entries 0 · monthly_work_results 0 · accounts 1 · org_units 8 · people 36 (35 + ADMIN-TK) · work_catalog_entries 320 · product_items 3386 · product_groups 80 · person_supervisions 0 · audit_events 0 · task_attachments 0`.
* **Tài khoản Super Admin trên rehearsal (kiểm chứng lại 22/10 lúc 14:37):**
  đăng nhập ✔ · `mustChangePassword=true` ✔ · vai trò `SYSTEM_ADMIN` + **không gắn đơn vị** ✔ · **mọi API bị chặn 403 "PHẢI ĐỔI MẬT KHẨU"** ✔ · đổi mật khẩu ✔ · đăng nhập lại ✔ · trung tâm phân quyền mở ✔ · **tạo tài khoản cán bộ (quyền `users.manage`) → HTTP 201** ✔ · **không duyệt được nghiệp vụ (hàng đợi rỗng)** ✔ · không thấy dữ liệu cũ ✔.
  *(Ghi chú: route tạo tài khoản chỉ hỗ trợ `POST`; vô hiệu hoá tài khoản dùng `PATCH /api/people/[id]/account/status`. Tài khoản thử nghiệm đã được dọn khỏi rehearsal — còn đúng 1 tài khoản, 36 người.)*
* **Khôi phục mật khẩu độc lập đã thử thực tế:** `admin-account.mjs reset-password` → tạo file credential mới → đăng nhập lại được ✔ (không dùng script reset).

## 4b. KIỂM THỬ (đối chiếu đúng số liệu — 17 bộ / **471 pass / 0 fail**)

| # | Bộ test | Kết quả |
|---|---|---|
| 1 | `test-v3-f18-routine` | 26 pass / 0 fail |
| 2 | `test-v3-e2e-flow` | 40 pass / 0 fail |
| 3 | `test-v3-f01-f05` | 22 pass / 0 fail |
| 4 | `test-v3-review-flow` | 38 pass / 0 fail |
| 5 | `test-v3-permissions` | 24 pass / 0 fail |
| 6 | `test-v3-multi-product` | 36 pass / 0 fail |
| 7 | `test-v3-evidence-adjustment` | 21 pass / 0 fail |
| 8 | `test-v3-private-attachments` (mới — kho tệp private) | **14** pass / 0 fail |
| 9 | `test-v3-no-self-approval` (mới — chặn tự duyệt) | **5** pass / 0 fail |
| 10 | `test-yc38-f12-date-mapping` | 30 pass / 0 fail |
| 11 | `test-yc38-datetime-tz` | 19 pass / 0 fail |
| 12 | `test-yc38-locked-task` | 15 pass / 0 fail |
| 13 | `test-yc38-submit-approval` | 36 pass / 0 fail |
| 14 | `test-yc38c-linkage` | 28 pass / 0 fail |
| 15 | `test-yc38-uat-origin-tx` | 23 pass / 0 fail |
| 16 | `test-yc33-scoring-parity` | 38 pass / 0 fail |
| 17 | `test-yc30-regression` | 56 pass / 0 fail |
| | **TỔNG** | **471 pass / 0 fail** (15 bộ gốc = 452 · +14 · +5) |

## 5. KHO LƯU TRỮ + KIỂM CHỨNG PHỤC HỒI

| Thành phần | Kết quả |
|---|---|
| Bản lưu trữ (**v2 — mới nhất, 14:23**) | `demo-ops/archive/prod-2026-10-22-v2/` — schema (76 bảng, DDL + số dòng) · data-export (76 bảng / **7.644 dòng**) · `files/` (1 tệp, 2.185.864 B) · `archive-manifest.json` |
| Checksum v2 | schema `5ee295f6…` · data `54c4d369…` · tệp `546eede3…` |
| Backup mới nhất | `demo-ops/yc38c-backup/prod-pre-reset-20261022-142357.json` (76 bảng / 7.644 dòng / sha256 `66212e5b…`) |
| Dữ liệu phát sinh **sau 13:58** | Đã nằm trong backup + archive v2: `audit_events +12 · personal_work_items +2 · routine_entries +2 · result_submissions +2 · submission_values +4 · task_updates +1 · notifications +1 · evaluation_assessments +1 · permissions +1 · role_permissions +1` (tổng +27 dòng) |
| **Restore-test v2 (môi trường riêng)** | `talung_archive_restore`: restore 7.644 dòng → **76/76 bảng khớp, 0 khác** · checksum tệp **khớp** → `demo-ops/reset/restore-test-result.json` = **PASS** |
| **Độ phủ ma trận reset** | `scripts/verify-reset-coverage.mjs` → **PASS**: 76 bảng, 63 bảng có dữ liệu — **mọi bảng đều được XOÁ / TẠO LẠI / GIỮ** theo ma trận (52 XOÁ · 3 TẠO LẠI · 8 GIỮ); đã loại 2 tên bảng không tồn tại (`feedback`, `plan_item_work_links`) |

## 6. PREFLIGHT (đã chạy trên Production, GO)

```
[OK ] Ket noi dung DB Production - aws-0-ap-northeast-1.pooler.supabase.com/postgres
[OK ] Co backup moi nhat (3.894.119 B)   [OK ] Co ket qua restore-test (PASS)
[OK ] Danh muc TX = 320 ma + 28 dong loai  [OK ] Co snapshot QD1277 (nguon + trang thai)
[OK ] Nguon: units=11 people=39 SP=3386 nhom=80   [OK ] Co role SYSTEM_ADMIN
[OK ] Quyen ky thuat day du (11 quyen)    [OK ] SYSTEM_ADMIN khong co quyet duyet nghiep vu
[OK ] Manifest tep + tep da luu tru (2.185.864 B)   [OK ] Can don sach tep trong Storage
KET QUA: GO
```

## 7. LỆNH EXECUTE (chưa chạy — chờ lệnh riêng của chủ dự án)

```bash
# BƯỚC 1 — dọn kho tệp Storage SAU khi đã lưu trữ (cần service-role key trên máy chủ)
node scripts/purge-storage.mjs --bucket=task-attachments --dry-run     # xem kế hoạch
node scripts/purge-storage.mjs --bucket=task-attachments --confirm=PURGE-2026-10-22

# BƯỚC 2 — làm sạch + nạp dữ liệu nền (lệnh xoá, có mã xác nhận)
node scripts/reset-and-init.mjs \
  --db=<DATABASE_URL Production> --source-db=<DATABASE_URL Production> \
  --mode=production --confirm=RESET-2026-10-22
```

* Script tự chặn nếu `--db` không trỏ tới Supabase Production ✔
* Script tự ghi `reset-manifest-production-<thời điểm>.json` (đã xoá gì · đã tạo gì · checksum · nghiệm thu) ✔
* Sau lệnh: `KET QUA: PASS` = 0 nghiệp vụ + dữ liệu nền đủ + đúng 1 tài khoản admin.

## 8. PHƯƠNG ÁN ROLLBACK

| Tầng | Cách thực hiện | Thời gian |
|---|---|---|
| Mã | `git revert --no-commit d524576..<sha V3>` hoặc deploy lại SHA cũ (chi tiết §6 của `DEPLOY_PRODUCTION_V3_2026-10-22.md`) | 2–4 phút |
| Dữ liệu | `pg-backup-restore.mjs restore --file=demo-ops/yc38c-backup/prod-pre-private-20261022-133527.json` (đã kiểm chứng 76/76 bảng) | 2–4 phút |
| Tệp | `demo-ops/archive/prod-2026-10-22/files/` (checksum đã kiểm chứng) | tức thì |
| Cấu hình | `demo-ops/archive/prod-2026-10-22/archive-manifest.json` (roles/permissions/config + phiên bản app) | tức thì |

## 9. ĐIỂM CÒN CHẶN / CẦN CHỦ DỰ ÁN LÀM

> **Trạng thái cấu hình máy chủ Production (đọc qua `GET /api/admin/system/env-status` — chỉ boolean, không lộ giá trị):**
> `DATABASE_URL` ✔ · `DIRECT_URL` ✔ · `JWT_SECRET` ✔ · **`SUPABASE_SECRET_KEY` ✔ (đã có — dùng làm khóa server cho Storage)** · `SUPABASE_EVIDENCE_BUCKET` ✔ · `STORAGE_DRIVER=supabase` ✔
> ⚠️ `NEXT_PUBLIC_SUPABASE_URL` **chưa đặt** (đang dùng giá trị mặc định trong mã — nên đặt tường minh) · ⚠️ `SUPABASE_STORAGE_BUCKET` chưa đặt (mặc định `task-attachments`) · ⚠️ `SUPABASE_STORAGE_PRIVATE` **chưa bật**
> **Trạng thái bucket đo từ server:** `task-attachments` → **public: true** ⛔ (cần chuyển PRIVATE) · `work-evidence` → **public: false** ✔

| # | Việc | Trạng thái | Ai làm |
|---|---|---|---|
| 1 | **Chuyển bucket `task-attachments` sang PRIVATE** (Supabase → Storage → bucket → Public OFF) | ⛔ đang `public: true` | **Chủ dự án** — theo thứ tự trong `docs/V3/PRIVATE_STORAGE_SETUP.md` |
| 2 | **Đặt `SUPABASE_STORAGE_PRIVATE=1`** trên Vercel Production + redeploy (bắt buộc bucket private + fail-closed) | ⛔ chưa bật | **Chủ dự án** (sau khi đã flip bucket) |
| 3 | *(Khuyến nghị)* Đặt tường minh `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_STORAGE_BUCKET=task-attachments` | ⚠️ đang dùng giá trị mặc định | **Chủ dự án** |
| 4 | **Khóa service-role**: server đã có `SUPABASE_SECRET_KEY` ✔ — nhưng cần xác nhận đây là **secret key** (không phải publishable) và dùng cho `purge-storage.mjs` khi dọn kho | ⚠️ cần xác nhận | **Chủ dự án** |
| 5 | Bàn giao **file Excel QĐ1277 gốc** để đối chiếu 3.386 SP + 2.838 hệ số | ⛔ B-1 | **Chủ dự án** |
| 6 | Chốt **tuyến phê duyệt** theo phân công thực tế | ⛔ B-3 (sau reset, hồ sơ **chờ phân tuyến** ⇒ các chức năng phê duyệt **khóa an toàn**) | **Chủ dự án** |
| 7 | Cấp tài khoản cho 35 cán bộ | ⛔ B-6 (đợt sau) | **Chủ dự án** (Super Admin đã được quyền `users.manage` ⇒ tự tạo được qua `/admin/permissions`) |
| 8 | Phát lệnh EXECUTE | ⛔ | **Chủ dự án** |

> Sau khi mục 1–2 xong, chạy `node scripts/verify-private-storage.mjs` để kiểm chứng tự động: URL công khai bị từ chối · không liệt kê được tệp · route nội bộ 200/403/401 đúng.

## 10. KIỂM CHỨNG SAU RESET (checklist nghiệm thu)

- [ ] `0` kế hoạch · `0` nhiệm vụ · `0` đầu việc · `0` nhật ký công việc/tác nghiệp · `0` kết quả tháng · `0` hồ sơ chờ phê duyệt · `0` tài khoản DEMO
- [ ] `1` tài khoản Super Admin hoạt động (đăng nhập được, bị ép đổi mật khẩu lần đầu, không duyệt được nghiệp vụ)
- [ ] Cơ cấu tổ chức 8 đơn vị + 35 nhân sự + 320 TX + 3.386 SP + 80 nhóm đầy đủ
- [ ] Refresh / đăng nhập lại / tác vụ nền **không** làm dữ liệu cũ xuất hiện lại
- [ ] Màn hình trống hiển thị rõ ràng, chuyên nghiệp
- [ ] V3 vẫn chạy: luồng duyệt, nhật ký tác nghiệp F18/F19, phân quyền, kết quả tháng — **regression ≥ 466 test PASS**
- [ ] Tệp cũ **không** tải được công khai (`/storage/v1/object/public/...` → từ chối) và kho đã sạch
