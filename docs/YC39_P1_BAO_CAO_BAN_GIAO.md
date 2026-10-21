# YC-39 P1 — BÁO CÁO BÀN GIAO: KHÓA QUYỀN TẠO ĐƠN VỊ TỔ CHỨC

**Ngày:** 21/10/2026 · **Commit triển khai:** `f4f3860` · **Production:** `{"status":"ok","db":"up","commit":"f4f3860"}`
**Phạm vi:** **CHỈ P1** — không triển khai P2/P4/P5/P6/P7 hay G0–G7.
**Kết luận:** đã sửa, đã kiểm thử, **đã deploy** → **dừng chờ nghiệm thu (UAT chỉ quan sát).**

---

## 1. ROOT CAUSE & API ĐÃ SỬA

**Lỗ hổng:** `POST /api/org-units/tree` chỉ kiểm tra `authenticateRequest(req)` mà **không kiểm tra thẩm quyền**
⇒ **mọi tài khoản đã đăng nhập (kể cả Công chức)** đều tạo được đơn vị/bộ phận mới trong cây tổ chức
⇒ xuất hiện trong mọi danh sách chọn đơn vị (kế hoạch, nhiệm vụ, lịch trực) và làm rối dữ liệu tổ chức.

### 1.1. File đã sửa — `src/app/api/org-units/tree/route.ts` (chỉ `POST`; `GET` giữ nguyên)

| Vị trí | Nội dung |
|---|---|
| `POST` đầu | **Bắt buộc xác thực**: `if (!user) return jsonError("Yêu cầu đăng nhập", 401)` (trước đây thiếu hẳn → lỗi 500 khi không token) |
| Kiểm tra (1) | **Quản trị hệ thống (SYSTEM_ADMIN)** không được tạo đơn vị nghiệp vụ chỉ nhờ quyền quản trị kỹ thuật: quyền `org.manage` phải đến từ **một vai trò nghiệp vụ** (`role_grants.role.code ≠ 'SYSTEM_ADMIN'`). Nếu không ⇒ **403** |
| Kiểm tra (2) | **Mọi vai trò khác** phải có `checkPermission(user, "org.manage")` ⇒ Công chức / Trưởng bộ phận (không có quyền này) ⇒ **403** |
| Kiểm tra (3) | **Phạm vi**: đơn vị cha phải nằm trong phạm vi được phép (`getAuthorizedUnitIds`) ⇒ **403 SCOPE_VIOLATION**. Cờ `RBAC_HARDEN_ORGUNIT_CREATE_SCOPE` (mặc định **BẬT**) chỉ chi phối kiểm tra này |
| Thứ tự | Xác thực → thẩm quyền (1)(2) → thẩm quyền (3)/phạm vi → **validate dữ liệu** → ghi DB ⇒ request bị từ chối **không** tạo bản ghi nào |

### 1.2. Quyền đã kiểm tra (Production, chỉ đọc)

| Kiểm tra | Kết quả |
|---|---|
| `org.manage` thuộc vai trò nào | `UNIT_LEADER` ✔ · `SYSTEM_ADMIN` ✔ (nhưng **0 `role_grants`** ⇒ quyền đến từ danh sách quyền hệ thống `SYSTEM_ADMIN_PERMISSIONS`, `guard.ts:16-23`) · `DEPARTMENT_LEADER` ✘ · `STAFF` ✘ |
| Còn đường nào tạo được đơn vị? | **Không** — quét 88 route API: chỉ `org-units/tree` có `orgUnit.create`; `PATCH/DELETE org-units/[id]` đã có `canManageOrg` (giữ nguyên); `POST /api/positions` đã yêu cầu `org.manage`/`users.manage` |
| Có thay đổi quyền hệ thống? | **Không** — `guard.ts` **không** bị đụng; không thêm/sửa/xoá `Role`/`Permission`/`RoleGrant` |

### 1.3. An toàn / rollback

| Yêu cầu | Thực hiện |
|---|---|
| Không có feature flag mở lại đường trái quyền | ✔ Kiểm tra (1) `org.manage` và (2) `checkPermission` **không** nằm sau cờ nào. Cờ `RBAC_HARDEN_ORGUNIT_CREATE_SCOPE` chỉ bỏ kiểm tra **phạm vi** ⇒ tắt cờ vẫn chặn Công chức |
| Đường rollback an toàn | ✔ Tắt `RBAC_HARDEN_ORGUNIT_CREATE_SCOPE` (giữ nguyên kiểm tra thẩm quyền tối thiểu). Lưu ý: `git revert` toàn bộ commit sẽ **gỡ luôn** kiểm tra thẩm quyền ⇒ không dùng revert nếu chưa có bản vá thay thế |
| Không đổi schema / dữ liệu tổ chức | ✔ Không migration; `org_units` Production **8 → 8**, không đổi tên/mã/xoá/tạo đơn vị nào |
| Không đụng F1–F5 | ✔ Không sửa `task-transitions.ts` hay các route nhiệm vụ; bộ test khóa nhiệm vụ vẫn 15/15 |

---

## 2. KIỂM THỬ

### 2.1. Bộ mới — `scripts/test-yc39-p1-orgunit.ts` (**E2E HTTP thật**, DB local) — **15/15 ✔**

| # | Yêu cầu | Kết quả |
|---|---|---|
| 1 | **Công chức POST tạo đơn vị** | ✔ **403** |
| 2 | **Lãnh đạo đơn vị POST tạo đơn vị** | ✔ **200/201** (được phép theo phạm vi hợp lệ) |
| 3 | **SYSTEM_ADMIN kỹ thuật POST tạo đơn vị** | ✔ **403** |
| 3b | Chưa đăng nhập POST | ✔ **401** |
| 4 | **GET cây tổ chức** (Công chức và quản trị) | ✔ **200**, dữ liệu đầy đủ — **không đổi chính sách** |
| 5 | Request bị từ chối ⇒ **không có thay đổi dữ liệu** | ✔ `org_units` 8 → 8; không còn mã thử nghiệm |
| 6 | **Không tạo được qua đường API thay thế** | ✔ Công chức `PATCH /api/org-units/[id]` → 403; `POST /api/positions` → 403 |
| 7 | Thiết kế cờ (kiểm tra tĩnh mã nguồn) | ✔ Kiểm tra `org.manage` **không** nằm sau cờ; cờ chỉ chi phối **phạm vi**; SYSTEM_ADMIN bị chặn theo **grant vai trò nghiệp vụ** |

**Ghi chú quan trọng (lỗi đã phát hiện & sửa trong lúc làm):** bản đầu dùng `user.permissions.includes("org.manage")` để
nhận diện quyền "được cấp tường minh" — **không đạt**, vì `org.manage` nằm ngay trong `role_permissions` của
chính role kỹ thuật `SYSTEM_ADMIN` ⇒ quản trị hệ thống vẫn tạo được đơn vị (test bắt được, HTTP 200).
Đã sửa: nhận diện bằng **grant có `role.code ≠ 'SYSTEM_ADMIN'`** ⇒ đúng ý nghĩa "từ vai trò nghiệp vụ".

**Tính lặp lại & an toàn của bài test:** dùng **tài khoản riêng** sinh trong test (3 tài khoản: Công chức,
Lãnh đạo, quản trị) với **mật khẩu ngẫu nhiên do script tự sinh**; không dùng mật khẩu demo Production,
không reset mật khẩu tài khoản người dùng; tự dọn tài khoản/đơn vị thử nghiệm sau khi chạy.

### 2.2. Hồi quy

| Bộ | Kết quả |
|---|---|
| `test-yc30-regression` (HTTP — tổ chức, tài khoản, kế hoạch, giao việc, phân quyền) | **56/56 ✔** |
| `test-yc39-p1-orgunit` (mới) | **15/15 ✔** |
| `test-yc38-locked-task` (khóa nhiệm vụ — F1–F5) | **15/15 ✔** |
| `test-yc38-submit-approval` | **36/36 ✔** |
| `test-yc38c-linkage` | **28/28 ✔** |
| `test-yc38-uat-origin-tx` | **23/23 ✔** |
| `test-yc38-datetime-tz` | **19/19 ✔** |
| `test-yc33-scoring-parity` · `-flow` · `test-yc34-36-eval` · `test-yc37-approval-flow` | **38/38 · 20/20 · 32/32 · 25/25 ✔** |
| `tsc --noEmit` · `next build` | ✔ không lỗi · ✔ build 91/91 |

### 2.3. Backup & restore-test (trước khi triển khai)

`demo-ops/yc38c-backup/yc38c-before-2026-10-21T10-15-39-111Z.json` — 74 model · **7.553 bản ghi** · **RESTORE-TEST PASS** (0 tham chiếu mồ côi).

---

## 3. KIỂM TRA PRODUCTION (chỉ đọc, sau deploy `f4f3860`)

| Đối tượng | Trước | Sau | Kết luận |
|---|---|---|---|
| `org_units` | 8 | **8** | ✔ không tạo/xoá/đổi tên đơn vị nào |
| Đơn vị thử nghiệm trên Production | 0 | **0** | ✔ không có gì để dọn |
| `accounts` / `roles` / `permissions` / `role_grants` | 24 / 4 / 11 / 25 | **24 / 4 / 11 / 25** | ✔ không đổi Role/Permission/RoleGrant |
| `role_grants` của `SYSTEM_ADMIN` | 0 | **0** | ✔ không cấp quyền mới cho ai |
| `tasks` / `personal_work_items` / `monthly_work_results` | 22 / 31 / 15 | **22 / 31 / 15** | ✔ không ảnh hưởng nghiệp vụ |
| Health | ok | **ok, `db=up`, `commit=f4f3860`** | ✔ |

⚠️ **Hạn chế kiểm tra Production:** không thể gọi HTTP `GET /api/org-units/tree` để đối chiếu trực tiếp vì
**mật khẩu 3 tài khoản demo trên Production đã thay đổi** (file `demo-ops/demo-secrets.json` không còn khớp ⇒
đăng nhập 401) — **lỗi môi trường đã báo trước đây, không liên quan bản vá P1** (P1 chỉ sửa `POST`; `GET` không đổi mã nguồn).
Không thực hiện request ghi nào trên Production; không tạo đơn vị thử nghiệm trên Production.

---

## 4. HƯỚNG UAT (CHỈ QUAN SÁT — KHÔNG GHI DỮ LIỆU)

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập bằng tài khoản **Công chức** → mở màn hình tổ chức, thử **tạo đơn vị mới** | **Từ chối** kèm thông báo *"Bạn không có quyền tạo đơn vị/bộ phận mới."*; danh sách đơn vị **không** thay đổi |
| 2 | Đăng nhập bằng tài khoản **Trưởng bộ phận** → thử tạo đơn vị | **Từ chối** (Trưởng bộ phận không có quyền `org.manage` theo cấu hình hiện tại) |
| 3 | Đăng nhập bằng tài khoản **Lãnh đạo đơn vị** → thử tạo đơn vị | **Được phép** (là thao tác hợp lệ, giữ nguyên hành vi cũ) |
| 4 | Mọi vai trò → xem **cây tổ chức** | Vẫn xem được đầy đủ, **không** bị ảnh hưởng |
| 5 | Kiểm tra danh sách chọn đơn vị ở kế hoạch / nhiệm vụ / lịch trực | Không có đơn vị lạ; cây tổ chức giữ nguyên 8 đơn vị |

> **Lưu ý:** nếu trường hợp 3 (Lãnh đạo) không tạo được, báo lại — có thể do phạm vi đơn vị cha.
> **Không** tự tạo đơn vị thử nghiệm trên Production; nếu cần kiểm chứng thì báo để được cấp phép.

---

## 5. PHẠM VI CÒN LẠI & VIỆC CHỜ

| Hạng mục | Trạng thái |
|---|---|
| P1 (bản vá này) | ✅ Đã deploy `f4f3860` — chờ nghiệm thu |
| P2 (chặn sửa số liệu nháp của người khác) | ⛔ **Chưa** triển khai (theo phê duyệt) |
| P4 / P5 / P6 / P7 | ⛔ **Chưa** triển khai (theo phê duyệt) |
| G0–G7 (Module RBAC) | ⛔ **Chưa** triển khai — chờ 8 quyết định nghiệp vụ Q-RB1…Q-RB8 (`docs/YC39_06_...`) |
| Môi trường | ⚠️ Mật khẩu tài khoản demo Production đã đổi ⇒ 2 bộ test HTTP Production (`test-yc30-regression`, `test-yc33-36-production-smoke`) **không chạy được**; đã chạy thay bằng bản **local** (56/56) |

**Khai báo:** `P1_DEPLOYED = YES (f4f3860)` · `SCHEMA_CHANGE = NONE` · `DATA_CHANGE = NONE` ·
`UAT_STATUS = CHỜ NGHIỆM THU (chỉ quan sát, không ghi dữ liệu)`.
