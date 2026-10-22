# CẤP TÀI KHOẢN NGƯỜI DÙNG — 22/10/2026 (sau reset Production)

**Lệnh:** chủ dự án yêu cầu cấp tài khoản cho nhân sự (đợt còn lại sau reset).
**Kết quả:** đã tạo **34 tài khoản** trên Production (`https://task-cus.vercel.app`) — kiểm chứng **26/26 pass**.
**Script:** `scripts/create-staff-accounts.mjs` (mặc định DRY-RUN, chỉ ghi khi có `--confirm=CREATE-ACCOUNTS-2026-10-22`; idempotent, không đụng tài khoản đã có).
**File bàn giao:** `demo-ops/reset/staff-accounts-2026-10-22.csv` (ngoài git · sha256 `4ac6c58a1e04b3fc1b9fcb9f18e7443fcac6405a668a6696ad0dc2daed79afc8`).

## 1. Quy tắc (chủ dự án chốt 22/10/2026)

| Nhóm | Tài khoản | Mật khẩu mặc định | Bắt buộc đổi lần đầu |
|---|---|---|---|
| Công chức hải quan | `hqtl001` … `hqtl028` (28 người) | `Talung@2026` | ✅ CÓ |
| Hợp đồng lao động 111 | `hdld001` … `hdld006` (6 người) | `Talung@2026` | ✅ CÓ |
| Lãnh đạo đơn vị (theo thứ tự chủ dự án chốt) | hqtl001 Hoàng Văn Bằng · hqtl002 Trần Nguyên Đán · hqtl003 Nông Xuân Ánh | | |
| Không cấp | Lê Văn Hậu (Phó trưởng Hải quan **KHU VỰC**, ngoài đơn vị Tà Lùng) | | |

> Đổi mật khẩu lần đầu: hệ thống chặn **mọi API** (HTTP 403 `PHẢI ĐỔI MẬT KHẨU`) cho tới khi người dùng đặt mật khẩu mới → phiên cũ bị vô hiệu, phải đăng nhập lại.

> **Cập nhật 22/10/2026 (sau bàn giao):** chủ dự án đã tự đặt lại mật khẩu cho các tài khoản qua giao diện quản trị (audit ghi 50 sự kiện `ACCOUNT_PASSWORD_RESET` lúc ~15:50; `hqtl001` có thêm `PASSWORD_CHANGED` lúc 09:48). Vì vậy **`Talung@2026` không còn là mật khẩu hiện hành** — không dùng CSV cũ để đăng nhập; chủ dự án cấp mật khẩu mới cho từng người. Tài liệu này chỉ giữ quy tắc cấp ban đầu, không lưu mật khẩu thực tế.

## 2. Vai trò & phạm vi

| Vai trò | Ai được gán | Quyền chính | Phạm vi dữ liệu |
|---|---|---|---|
| `UNIT_LEADER` (3) | Lãnh đạo đơn vị | duyệt kế hoạch, phân công, xem toàn đơn vị | `ORGANIZATION` (xem tất cả) |
| `DEPARTMENT_LEADER` (5) | Nguyễn Hải Yên, Nguyễn Đình Giang, Hoàng Văn Huynh, Lã Trần Minh, Trần Minh Hoàng | duyệt kế hoạch, tạo kế hoạch trong bộ phận | `DEPARTMENT` (đơn vị của bộ phận) |
| `STAFF` (26) | 20 công chức + 6 HĐLĐ | cập nhật việc của mình, xem kế hoạch/báo cáo | `DEPARTMENT` (đơn vị) — 6 HĐLĐ: `OWN` (chưa có đơn vị) |

**Chức danh Lãnh đạo đơn vị** (gán 22/10/2026 bằng `scripts/assign-leadership-positions.mjs`, role giữ nguyên `UNIT_LEADER`):

| Tài khoản | Họ tên | Chức vụ |
|---|---|---|
| `hqtl001` | Hoàng Văn Bằng | Trưởng hải quan cửa khẩu (`CHI_CUC_TRUONG`) |
| `hqtl002` | Trần Nguyên Đán | Phó Trưởng hải quan cửa khẩu (`DEPUTY_CHIEF`) |
| `hqtl003` | Nông Xuân Ánh | Phó Trưởng hải quan cửa khẩu (`DEPUTY_CHIEF`) |

> 5 tài khoản `DEPARTMENT_LEADER` chưa gán chức danh Trưởng/Phó bộ phận (chưa có dữ liệu phân biệt) — xem `CO_CAU_TO_CHUC_2026-10-22.md` §6.

## 3. Kiểm chứng sau khi cấp (Production)

* Đăng nhập `hqtl001` (lãnh đạo) bằng mật khẩu mặc định → 200, `mustChangePassword=true` → API 403 → đổi mật khẩu → đăng nhập lại → **có `plans.approve`, `tasks.assign`** → API nghiệp vụ mở (200) → **đã trả lại mật khẩu mặc định + ép đổi lần đầu** (để bàn giao đúng).
* `hqtl006` (cán bộ) và `hdld001` (HĐLĐ): đăng nhập 200, bị chặn 403 cho tới khi đổi mật khẩu; mật khẩu mặc định vẫn đúng (chưa đổi).
* Sai mật khẩu / tài khoản không tồn tại → 401 ✔.
* DB: tổng **36 tài khoản** = 34 mới + `admin.tk` (quản trị kỹ thuật) + `cccntt` (tài khoản CNTT do chủ dự án tự tạo, **không bị đụng**).
* Không trùng tên đăng nhập, mỗi người 1 tài khoản, tất cả đều bật ép đổi mật khẩu lần đầu ✔.
* Audit: mỗi tài khoản tạo ra 1 sự kiện `ACCOUNT_CREATE_BULK` ✔.

## 4. Còn lại (chưa làm, cần chủ dự án quyết)

| # | Việc | Ảnh hưởng |
|---|---|---|
| 1 | **6 HĐLĐ chưa gán đơn vị** | Đăng nhập được nhưng danh sách công việc/kế hoạch sẽ trống (phạm vi `OWN`). Cần gán đơn vị (thường là bộ phận sử dụng nhiều nhất) |
| 2 | **Chưa có tuyến phê duyệt** (`person_supervisions = 0`) | Lãnh đạo/Trưởng nhóm chưa có đường duyệt hồ sơ tự động; phải duyệt tay hoặc gán tuyến sau |
| 3 | **Lê Văn Hậu** chưa có tài khoản | Cấp thêm khi có quyết định (nếu cần, sẽ là `hqtl029`) |
| 4 | 35 cán bộ còn lại: **chưa cấp tài khoản người dùng khác** (đơn vị đã đủ 28+6) | — |
| 5 | Tính năng đính kèm tệp | **Vẫn lỗi 404** do khoá server trên Vercel không gọi được Storage API (`object/list` 404 mọi bucket) — cần sửa khoá `SUPABASE_SECRET_KEY` (xem `RESET_PRODUCTION_EXECUTED_2026-10-22.md` §5) |
