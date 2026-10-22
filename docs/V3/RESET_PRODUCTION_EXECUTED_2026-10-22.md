# BIÊN BẢN THỰC THI RESET PRODUCTION — 22/10/2026

**Lệnh của chủ dự án:** khởi tạo mới hoàn toàn dữ liệu vận hành Production.
**Thực thi:** 22/10/2026 15:36–15:40 (giờ VN) · **Manifest:** `demo-ops/reset/reset-manifest-production-2026-10-22-08-36-40.json`
**Mã nguồn trên Production:** `ad9ba76` → sau reset: `ada3134`… (mã không đổi; reset chỉ đụng dữ liệu)

---

## 1. LỆNH ĐÃ CHẠY

```bash
node scripts/reset-and-init.mjs \
  --db=<DATABASE_URL Production> --source-db=<DATABASE_URL Production> \
  --mode=production --confirm=RESET-2026-10-22
```
* Backup cuối trước reset: `demo-ops/yc38c-backup/prod-final-20261022-151013.json` (76 bảng / 7.644 dòng / sha256 `66212e5b…`)
* Preflight trước đó: **GO 14/14** · Độ phủ ma trận: **PASS** (63/63 bảng có dữ liệu)

## 2. ĐÃ XOÁ (41 bảng · 3.952 dòng)

| Nhóm | Bảng / số dòng xoá |
|---|---|
| Audit | `audit_events` 1.520 |
| Điểm số & báo cáo | `metric_daily_entries` 636 · `metric_entry_revisions` 636 · `metric_plan_targets` 49 · `metric_baselines` 47 · `report_blocks` 17 · `briefing_narratives` 21 · `briefing_report_versions` 4 · `narrative_sections` 7 |
| Nhiệm vụ & kế hoạch | `tasks` 23 · `task_updates` 49 · `task_assignees` 11 · `task_attachments` 1 · `task_comments` 2 · `comment_reactions` 3 · `plans` 5 · `plan_items` 14 · `plan_task_links` 4 · `task_counters` 1 |
| Đầu việc | `personal_work_items` 35 · `work_item_products` 1 · `work_item_assignments` 4 |
| Nhật ký & kết quả | `routine_entries` 22 · `result_submissions` 18 · `submission_values` 80 · `monthly_work_results` 15 |
| Phê duyệt | `approval_cases` 3 · `approval_decisions` 3 · `evaluation_assessments` 3 |
| Thông báo & việc vụ khác | `notifications` 179 · `push_subscriptions` 2 · `leave_requests` 4 · `meetings` 1 · `department_work_items` 3 · `duty_rosters` 57 · `duty_day_infos` 5 · `duty_positions` 9 · `deadline_requests` 1 · `activity_templates` 48 |
| Danh mục TX cũ | `work_catalog_entries` 348 → **nạp lại 320** |
| Tổ chức & nhân sự | `org_units` 11 · `people` 39 · `person_assignments` 48 · `accounts` 24 · `role_grants` 25 → **nạp lại 8 / 35 / — / 1** |

## 3. ĐÃ NẠP LẠI (dữ liệu nền chuẩn hoá)

| Thành phần | Kết quả | Nguồn + checksum |
|---|---|---|
| Đơn vị | **8** | Excel "Cơ cấu tổ chức" (`docs/Dữ liệu-file-hải-quân-gửi/Danh sách.xlsx`) |
| Nhân sự | **35** (+1 `ADMIN-TK`) | Excel "Danh sách" — **không tạo tài khoản cho cán bộ** |
| Mã TX | **320** (348 − 28 trùng) | `tx-348-dong-320-ma.csv` · sha256 `05302639df409cb2…` · **141 hệ số để NULL** |
| SP QĐ1277 | **3.386** + **80 nhóm** | trích xuất từ DB nguồn đã kiểm chứng · **2.838 có hệ số / 548 NULL (không suy luận)** · `pendingVerification: true` (chờ file gốc) |
| Cấu hình nền | roles 4 · permissions 12 · role_permissions 32 · positions 9 · reporting_periods 3 · form_templates 1 · system_configs 8 · metric_* · catalog versions | giữ nguyên |
| Super Admin | **1** `admin.tk` — vai trò `SYSTEM_ADMIN`, **không gắn đơn vị**, **không có `plans.approve`**, mật khẩu ngẫu nhiên, `mustChangePassword=true` | file credential git-ignored + ACL (không in ra log) |

## 4. KIỂM CHỨNG SAU RESET (Production)

| Hạng mục | Kết quả |
|---|---|
| `plans` · `tasks` · `personal_work_items` · `routine_entries` · `monthly_work_results` · `notifications` · `task_attachments` · `work_evidences` · `result_submissions` · `approval_cases` | **0** ✔ |
| `person_supervisions` | **0** ✔ (chưa gán tuyến — chức năng phê duyệt **khóa an toàn**, hồ sơ chờ phân tuyến) |
| `audit_events` | 0 sau xoá; hiện chỉ có **4 sự kiện MỚI** (LOGIN/PASSWORD_CHANGED của phiên kiểm chứng) — không còn dữ liệu cũ ✔ |
| Tài khoản | **1** (`admin.tk`) · **0** tài khoản DEMO ✔ · vai trò `SYSTEM_ADMIN` · không có đơn vị ✔ |
| Đăng nhập Super Admin | ✔ · **bị ép đổi mật khẩu lần đầu** (mọi API 403 "PHẢI ĐỔI MẬT KHẨU") ✔ · đổi xong đăng nhập lại ✔ · trung tâm phân quyền mở ✔ |
| Màn hình | `/login` · `/admin/system` · `/admin/permissions` · `/my-work` · `/tasks` · `/routine` · `/reports` → **HTTP 200** ✔ |
| Danh mục | TX **320** ✔ · SP **3.386**/80 nhóm ✔ · nhân sự **36** (35 + admin) ✔ |
| API nghiệp vụ cho Super Admin kỹ thuật | **403** — đúng thiết kế (quản trị kỹ thuật không xem dữ liệu nghiệp vụ theo đơn vị) |

## 5. CÒN CHẶN (KHÔNG ảnh hưởng dữ liệu đã làm sạch)

| # | Vấn đề | Mức | Cách xử lý |
|---|---|---|---|
| 1 | **1 tệp cũ còn trong bucket `task-attachments`** (đã lưu trữ + checksum `546eede3…`) | 🟡 | URL công khai **đã bị chặn** (HTTP 400) nhưng **publishable key vẫn đọc/liệt kê được** (policy `anon` của Storage còn mở). Xoá tệp trong Supabase Dashboard → Storage → task-attachments (1 tệp) **hoặc** gỡ policy đọc công khai |
| 2 | **Khoá server trên Vercel không truy cập được Storage API** (`object/list` trả 404 cho mọi bucket) ⇒ endpoint dọn kho (`/api/admin/system/purge-storage`) không chạy được | 🟡 | Đặt lại khoá: Supabase → Project Settings → API → **service_role (legacy JWT)** cho `SUPABASE_SECRET_KEY`, hoặc kiểm tra khoá `sb_secret_` có đúng project không; sau đó chạy lại endpoint (mặc định dry-run) |
| 3 | File Excel QĐ1277 gốc chưa bàn giao | 🟢 | Danh mục đang ở trạng thái *"chờ đối chiếu file gốc"* (manifest ghi rõ) |
| 4 | Tuyến phê duyệt + 35 tài khoản cán bộ | 🟢 | Cấp sau (Super Admin đã có quyền `users.manage`) — **không chặn** vận hành |

## 6. ROLLBACK (nếu cần)

```bash
# Dữ liệu (đã kiểm chứng 76/76 bảng, 0 vi phạm FK)
node scripts/pg-backup-restore.mjs restore --db=<DATABASE_URL Production> \
  --file=demo-ops/yc38c-backup/prod-final-20261022-151013.json
# Mã: git revert --no-commit d524576..ad9ba76  (hoặc deploy lại SHA cũ)
# Tệp: demo-ops/archive/prod-2026-10-22-v2/files/ (checksum đã kiểm chứng)
```
