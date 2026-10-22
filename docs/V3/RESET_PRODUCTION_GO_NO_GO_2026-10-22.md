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
* **Đăng nhập Super Admin trên rehearsal: 11/13 → sau sửa kỳ vọng: đạt** — đăng nhập ✔ · `mustChangePassword=true` ✔ · vai trò `SYSTEM_ADMIN` ✔ · không có đơn vị ✔ · **mọi API bị chặn 403 "PHẢI ĐỔI MẬT KHẨU"** ✔ · trang `/change-password` ✔ · đổi mật khẩu ✔ · đăng nhập lại ✔ · trung tâm phân quyền mở ✔ · **không duyệt được hồ sơ nghiệp vụ (hàng đợi rỗng)** ✔.

## 5. KHO LƯU TRỮ + KIỂM CHỨNG PHỤC HỒI

| Thành phần | Kết quả |
|---|---|
| Bản lưu trữ | `demo-ops/archive/prod-2026-10-22/` — schema (76 bảng, DDL + số dòng) · data-export (76 bảng / **7.617 dòng**) · `files/` (1 tệp, 2.185.864 B) · `archive-manifest.json` |
| Checksum | schema `ca56facd…` · data `6109137d…` · tệp `546eede3…` |
| Backup bổ sung | `demo-ops/yc38c-backup/prod-pre-private-20261022-133527.json` (74→76 bảng, 7.617 dòng) |
| **Restore-test (môi trường riêng)** | `talung_archive_restore`: restore 7.617 dòng → **76/76 bảng khớp, 0 khác** · checksum tệp **khớp** → `demo-ops/reset/restore-test-result.json` = **PASS** |

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

| # | Việc | Trạng thái | Ai làm |
|---|---|---|---|
| 1 | **Đặt secret `SUPABASE_SERVICE_ROLE_KEY` trên Vercel Production** (bắt buộc để bucket PRIVATE và dọn kho tệp) | ⛔ chưa có | **Chủ dự án** (Vercel Dashboard → Settings → Environment Variables, Production) |
| 2 | **Chuyển bucket `task-attachments` sang PRIVATE** (Supabase → Storage → bucket → Public OFF) | ⛔ đang PUBLIC | **Chủ dự án** — theo thứ tự trong `docs/V3/PRIVATE_STORAGE_SETUP.md` |
| 3 | Đặt `SUPABASE_STORAGE_PRIVATE=1` (bắt buộc bucket private + service-role, fail-closed) | ⛔ chưa đặt | **Chủ dự án** (sau khi đã flip bucket) |
| 4 | Bàn giao **file Excel QĐ1277 gốc** để đối chiếu 3.386 SP + 2.838 hệ số | ⛔ B-1 | **Chủ dự án** |
| 5 | Chốt **tuyến phê duyệt** theo phân công thực tế (đơn vị trưởng / phó trưởng phụ trách) | ⛔ B-3 | **Chủ dự án** — sau reset, hồ sơ sẽ chờ phân tuyến |
| 6 | Cấp tài khoản cho 35 cán bộ (đợt sau) | ⛔ B-6 | **Chủ dự án** (qua Super Admin / `/admin/permissions`) |
| 7 | Phát lệnh EXECUTE | ⛔ | **Chủ dự án** |

## 10. KIỂM CHỨNG SAU RESET (checklist nghiệm thu)

- [ ] `0` kế hoạch · `0` nhiệm vụ · `0` đầu việc · `0` nhật ký công việc/tác nghiệp · `0` kết quả tháng · `0` hồ sơ chờ phê duyệt · `0` tài khoản DEMO
- [ ] `1` tài khoản Super Admin hoạt động (đăng nhập được, bị ép đổi mật khẩu lần đầu, không duyệt được nghiệp vụ)
- [ ] Cơ cấu tổ chức 8 đơn vị + 35 nhân sự + 320 TX + 3.386 SP + 80 nhóm đầy đủ
- [ ] Refresh / đăng nhập lại / tác vụ nền **không** làm dữ liệu cũ xuất hiện lại
- [ ] Màn hình trống hiển thị rõ ràng, chuyên nghiệp
- [ ] V3 vẫn chạy: luồng duyệt, nhật ký tác nghiệp F18/F19, phân quyền, kết quả tháng — **regression ≥ 466 test PASS**
- [ ] Tệp cũ **không** tải được công khai (`/storage/v1/object/public/...` → từ chối) và kho đã sạch
