# TALUNG-CUS-WORK — CLEAN RESET & REINITIALIZATION V3 (bàn giao PREPARE)

**Ngày:** 22/10/2026 · **Nhánh:** `feature/v3-demo` · **Production:** `d524576` — **CHƯA đụng vào Production**

> **Trạng thái:** đã hoàn tất **PREPARE** (chuẩn bị + diễn tập) và **dọn sạch môi trường local**. Bước **EXECUTE trên Production CHƯA được phép** — chờ chủ dự án phê duyệt (xem §6).

---

## 1. Đã làm

| # | Hạng mục | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | **Kiểm kê Production** (chỉ đọc) | 74 bảng; nghiệp vụ: 5 plans · 32 work items · 23 tasks · 19 routine entries · 15 monthly results · 24 accounts · 39 people · 11 org units · 348 TX · 3.386 SP | `scripts/pg-backup-restore.mjs backup` |
| 2 | **Backup Production (pre-reset)** | 74 bảng / **7.598 bản ghi** / 3.877.402 bytes / sha256 `510d72743f02570365d9c7f3a8d4f12c33c6bb2ea7bc46c866339bb7441d01be` | `demo-ops/yc38c-backup/prod-pre-reset-2026-10-22-*.json` |
| 3 | **Snapshot DB demo** (trước khi dọn) | 76 bảng / 8.700 bản ghi / sha256 `a93b9d30…` | `demo-ops/yc38c-backup/demo-before-reset-*.json` |
| 4 | **Script reset/import** (ma trận bảng, không TRUNCATE CASCADE, không DROP schema) | `scripts/reset-and-init.mjs` — chế độ `rehearsal` / `production` (production **bắt buộc** `--confirm=RESET-2026-10-22`) | file + manifest |
| 5 | **Rehearsal trên DB sạch** (`talung_v3_rehearsal`) | **PASS**: 8 đơn vị · 35 nhân sự (không tạo tài khoản) · 320 mã TX · 3.386 SP QĐ1277 · **1 Super Admin** · đối chiếu **SẠCH** | `demo-ops/reset/reset-manifest-rehearsal-*.json` |
| 6 | **Idempotent** | chạy lần 2: số lượng **không đổi**, không bản ghi trùng, PASS | cùng manifest |
| 7 | **Dọn sạch DB demo** (sau snapshot) | **0** plans/tasks/work items/routine entries/monthly results/mẫu cũ/thông báo; 36 người (35 + admin); 320 TX; 3.386 SP; **1 tài khoản**; **đăng nhập admin OK (HTTP 200)** | kiểm tra trực tiếp |
| 8 | **F19 — trang Nhật ký tác nghiệp** | đã bỏ hẳn mục *"Dùng mẫu nghiệp vụ cũ (TTHQ/GSHQ)"*; không còn mã giả KPS-01/TTHQ-01; trường DN/container chỉ hiện khi biểu mẫu yêu cầu; danh mục chỉ dùng **TX mới** | `src/app/routine/page.tsx` |
| 9 | **Hồi quy** | **433/433 PASS** (14 bộ, parity 38/38 giữ nguyên), typecheck + build OK | log kiểm thử |

## 2. Thành phần giao diện cũ đã loại bỏ

| Đã loại | Ở đâu |
|---|---|
| Select *"Danh mục nghiệp vụ liên quan"* (48 mẫu TTHQ/GSHQ) | `src/app/routine/page.tsx` → thay bằng `RoutineCatalogPicker` (danh mục TX 348 mục) |
| Mục *"Dùng mẫu nghiệp vụ cũ — chỉ để tra cứu dữ liệu cũ"* | xoá hẳn khỏi biểu mẫu nhập mới |
| Mã giả `KPS-01` / `TTHQ-01` hiển thị khi không có mã thật | `src/app/routine/page.tsx` → hiện `—` |
| Gửi `templateId` (mẫu cũ) khi lưu nhật ký | `src/app/api/routine/route.ts` → `templateId: null` |
| Trường DN/chủ hàng + container/phương tiện hiện vô điều kiện | chỉ hiện khi biểu mẫu (Form Builder) yêu cầu; không có biểu mẫu chuyên biệt → dùng biểu mẫu ghi nhận cơ bản |

## 3. Nguồn nhập lại

| Dữ liệu | Nguồn | Tình trạng |
|---|---|---|
| Cơ cấu tổ chức (8 đơn vị) | Sheet **"Cơ cấu tổ chức"** — `Danh sách.xlsx` (sha256 `ab13cac7…`) | ✅ đủ |
| Nhân sự 35 người / 42 lượt kiêm nhiệm | Sheet **"Danh sách"** | ✅ đủ (chưa tạo tài khoản) |
| 348 dòng → **320 mã TX** | Sheet **"Danh mục công việc"** (348 dòng, 28 dòng trùng bộ phận+nội dung trong chính file → bỏ, không tự sinh mã) | ✅ đủ; 4 mã lệch hệ số → lấy theo Excel, ghi trong manifest |
| **3.386 SP QĐ1277 + 80 nhóm** | **Trích xuất từ DB nguồn đã kiểm chứng** (file Excel gốc QĐ1277 **không có** trong workspace) | ⚠️ dùng bản trích xuất làm nguồn đối chiếu; cần bàn giao file gốc để đối chiếu lần cuối |
| 48 mẫu TTHQ/GSHQ | **không** nhập lại (không dùng làm danh mục chính thức) | ✅ |
| Cấu hình nền (roles 4, permissions 11, role_permissions 31, org 1, positions 9, kỳ 3, form_templates 1, system_configs 8, metric_* 57) | copy từ DB nguồn đã kiểm chứng | ✅ |

## 4. Bảo đảm chỉ 1 Super Admin ban đầu

- `admin.tk` — role `SYSTEM_ADMIN`, scope `ORGANIZATION`, **không** gắn đơn vị, **không** phải lãnh đạo.
- Mật khẩu **ngẫu nhiên 18 ký tự**, lưu tại `demo-ops/reset/super-admin-credentials-<ngày>.txt` (ngoài git, **không** in ra log).
- `SYSTEM_ADMIN` **không** có quyền duyệt nghiệp vụ mặc định (`checkPermission` chỉ cho quyền kỹ thuật; `canReviewAsDirectLeader` loại trừ SYSTEM_ADMIN).
- Đã kiểm tra **đăng nhập thành công (HTTP 200)**.

## 5. V3 có tương thích schema Production mới không

- Schema không đổi trong đợt này (chỉ thêm cột F18 ở nhánh V3 → **cần migration** khi phát hành).
- Môi trường sạch đã dùng **đúng schema V3** (`prisma db push`) ⇒ V3 chạy được.
- Bộ máy tính điểm **không sửa**; parity **38/38** giữ nguyên trong bộ test độc lập.
- **Điều kiện phát hành:** phải chạy migration F18 + reset trên Production trong maintenance window.

## 6. Blocker còn lại

| # | Blocker | Mức | Cần gì |
|---|---|---|---|
| B-1 | **File Excel nguồn QĐ1277 không có** trong workspace | 🟠 | Bàn giao file gốc để đối chiếu 3.386 SP + hệ số trước khi reset Production |
| B-2 | **Chưa có ràng buộc DB → biểu mẫu** (schema không có trường liên kết bộ phận ↔ form) | 🟠 | Thêm cột/cơ chế cấu hình biểu mẫu theo bộ phận (F19.7) — hiện mới có biểu mẫu cơ bản |
| B-3 | **`person_supervisions` chưa khai báo** (tuyến duyệt trực tiếp) | 🟠 | Chủ dự án xác nhận *Trưởng nhóm* theo từng bộ phận → ghi vào `person_supervisions` |
| B-4 | **"Bộ phận TH & Báo cáo"** có thể trùng `BP_TONGHOP_D` (70%) | 🟡 | Xác nhận gộp hay tách |
| B-5 | **6 người HĐLĐ 111** chưa gán đơn vị | 🟡 | Quyết định đơn vị hoặc để ngoài hệ thống nghiệp vụ |
| B-6 | **Tài khoản cho 35 cán bộ** chưa tạo (đúng yêu cầu: Super Admin cấp theo từng đợt) | 🟡 | Quy trình cấp tài khoản + tuyến phê duyệt |
| B-7 | **R3-C (điều chỉnh minh chứng 2 cấp)** mới chỉ khoá, chưa có màn hình đề nghị/duyệt | 🟡 | V3.0.3 |
| B-8 | **Dữ liệu cũ (attachments/storage)** chưa lập kho archive riêng cho files | 🟠 | Kế hoạch archive tệp (Supabase Storage) + quyền truy cập riêng |

## 7. Checklist PHẢI PHÊ DUYỆT TRƯỚC EXECUTE

- [ ] Xác nhận **nguồn QĐ1277** (file gốc) khớp bản trích xuất 3.386 SP
- [ ] Xác nhận **8 đơn vị** + **35 nhân sự** (tên, chức danh, kiêm nhiệm) đúng nguồn
- [ ] Xác nhận **320 mã TX** + 4 mã lệch hệ số (lấy theo Excel) — xem manifest
- [ ] Chốt **tuyến phê duyệt** (`person_supervisions`) theo từng bộ phận
- [ ] Chốt **"TH & Báo cáo"** gộp hay tách
- [ ] Xác nhận **kho archive**: DB + files + audit + cấu hình + phiên bản ứng dụng, quyền truy cập riêng
- [ ] Xác nhận **mật khẩu Super Admin** (lấy từ file credential, đổi ngay lần đầu)
- [ ] Xác nhận **kế hoạch cấp tài khoản** cho 35 cán bộ
- [ ] Chốt **maintenance window** + backup cuối + dừng luồng ghi + kiểm soát cron/seed/cache
- [ ] Phê duyệt **lệnh EXECUTE** (chạy `reset-and-init.mjs --mode=production --confirm=RESET-2026-10-22`)
- [ ] Sau EXECUTE: smoke test + đối soát manifest + phương án rollback đã sẵn sàng
