# YC-39 · BƯỚC 02 — RỦI RO BẢO MẬT & PHƯƠNG ÁN VÁ

**Ngày:** 21/10/2026 · **Đi kèm:** `YC39_01` (audit) · `YC39_02` (ma trận quyền) · `YC39_03` (thiết kế RBAC)
**Chế độ:** CHỈ ĐỌC / PHÂN TÍCH — không sửa code, migration, DB, phân quyền; **không** deploy; **không** push `main`.
**Phạm vi xác minh:** đọc mã nguồn + metadata Production. **Không** thực hiện POST/PATCH/DELETE trên Production.

> ⚠️ **Hai kết luận của BƯỚC 01 cần đính chính** (xem mục 0).

---

## 0. ĐÍNH CHÍNH SO VỚI BƯỚC 01

| # | BƯỚC 01 nói | Xác minh lại | Kết luận đúng |
|---|---|---|---|
| D1 | "`/reports/snapshots` không lọc đơn vị" | Route chỉ gọi `listReportSnapshots(user)` / `createReportSnapshot(user)`; **logic nằm ở `src/server/snapshots.ts`**: `authorizedUnits` + `SCOPE_VIOLATION` (`:128`), `FORBIDDEN` cho `SYSTEM_ADMIN` (`:87`, `:368`), lọc `unitId: {in: authorizedUnits}` (`:138`, `:381`) | ❌ **SAI** — `GET/POST` **có** kiểm tra phạm vi. Còn các sub-route `PUT/PATCH/DELETE /api/reports/snapshots/[id]` và `POST /api/reports/snapshots/[id]/verify` **chưa xác minh đầy đủ** ⇒ để lại mục "cần rà" (M2) |
| D2 | "`/metrics/entries` thiếu lọc đơn vị" | `metric_daily_entries` **không có cột `unit_id`**; `@@unique([metricId, classificationId, entryDate])` ⇒ về mặt dữ liệu, mỗi (chỉ tiêu, phân loại, ngày) là **một ô dùng chung toàn hệ thống**. `resolveEntryPerms` (`src/server/metrics.ts:69-92`) quyết định *ai được nhập* theo `person_assignments` | ⚠️ **CHÍNH XÁC HƠN**: không phải "thiếu lọc" mà là **mô hình dữ liệu không có chiều đơn vị** ⇒ *không vá được bằng bản vá nhỏ* (m1) |

---

## 1. XÁC MINH 6 RỦI RO

### M1 — `/metrics/entries`: mô hình dữ liệu không có chiều đơn vị 🔴 (cao, cần chính sách)

| Hạng mục | Xác minh |
|---|---|
| Đường truy cập | `GET/POST/PATCH/DELETE /api/metrics/entries` (492 dòng) + `GET /api/metrics/report`, `/api/metrics/summary`, `GET/POST /api/metrics/admin` |
| Ai truy cập được | Mọi tài khoản đã đăng nhập (`authenticateRequest`); **không** `checkPermission`, **không** lọc đơn vị |
| Kiểm tra quyền | `resolveEntryPerms(user)` (`server/metrics.ts:69`): `isMetricsAdmin` (`role === "UNIT_LEADER" \|\| checkPermission("system.config")`) ⇒ `all:true`; ngược lại dựng `assignments` từ `person_assignments` ⇒ mỗi đơn vị gán có `canEnter`/`canConfirm`; `permForMetric` áp `canEnter/canConfirm` theo chỉ tiêu |
| Đọc ngoài phạm vi? | **Có (theo thiết kế dữ liệu)**: `GET` lấy `where: { entryDate, metricId: {in: […]} }` (`:106-107`) ⇒ **mọi đơn vị thấy cùng một giá trị** của chỉ tiêu. Vì bảng không có `unit_id`, giá trị là **chung toàn hệ thống** |
| Ghi đè ngoài phạm vi? | **Có** — `POST` chỉ chặn `!p.canEnter` (`:256`) và chặn sửa bản ghi đã `SUBMITTED/CONFIRMED` (`:389`). Bản ghi ở trạng thái `DRAFT/RECORDED` **của đơn vị khác** vẫn bị cán bộ có `canEnter` ghi đè (cùng `metric+classification+date`) |
| Ảnh hưởng tài khoản thực tế | Cán bộ 2 bộ phận cùng nhập 1 chỉ tiêu → **giá trị bị lẫn**, ai nhập cuối thì thắng; lịch sử sửa (`metric_entry_revisions`) vẫn còn nên **không mất dấu vết**, nhưng **số liệu báo cáo bị sai** |
| Cách khắc phục tối thiểu | (a) **Không thể** sửa bằng bản vá nhỏ nếu chỉ tiêu phải theo đơn vị (cần `unit_id` ⇒ migration + backfill + sửa mọi truy vấn). (b) Bản vá **hạn chế tối đa, không đổi mô hình**: `POST` chỉ cho **người đã tạo bản ghi** sửa khi ở `DRAFT/RECORDED`; mọi sửa khác ⇒ `409` + ghi `metric_entry_revisions` đầy đủ. Không đụng dữ liệu cũ, không đổi báo cáo |
| Chức năng hợp lệ có nguy cơ bị khóa nhầm | Sửa số liệu **nháp** của chính người khác trong cùng đơn vị (hiện được phép) sẽ bị chặn ⇒ cần thông báo và cho phép lãnh đạo sửa |
| Test bắt buộc | (1) cán bộ đơn vị A nhập ô DRAFT của đơn vị B ⇒ 409; (2) chính tác giả sửa DRAFT ⇒ 200; (3) lãnh đạo sửa ô đã SUBMITTED ⇒ 200; (4) `GET` vẫn trả đúng như trước; (5) số dòng `metric_daily_entries`/`metric_entry_revisions` không đổi |

### M2 — `/reports/snapshots`: sub-route chưa xác minh 🟠 (trung bình)

| Hạng mục | Xác minh |
|---|---|
| Đường truy cập | `GET/POST /api/reports/snapshots` (có scope ✔), `GET/PUT/PATCH/DELETE /api/reports/snapshots/[id]`, `POST /api/reports/snapshots/[id]/verify` |
| Phạm vi | `server/snapshots.ts` lọc `unitId ∈ authorizedUnits` và chặn `SYSTEM_ADMIN` ✔ |
| Vấn đề còn lại | Các sub-route `[id]` (sửa/xoá/verify) **chưa được xác minh** trong bước này ⇒ **không khẳng định là lỗ hổng**; đưa vào danh sách "cần rà" và **không** vá vội |
| Khắc phục tối thiểu (nếu rà ra lỗ hổng) | Áp `checkPermission("reports.snapshot")` + kiểm tra `snapshot.unitId ∈ authorizedUnits` (hoặc `lockedById === user.personId`) trước mọi PUT/PATCH/DELETE/verify |
| Test | Người không thuộc đơn vị ⇒ 403 trên cả 4 thao tác; lãnh đạo đơn vị ⇒ 200 |

### M3 — `/org-units/tree`: tạo đơn vị không kiểm tra quyền 🔴 (cao)

| Hạng mục | Xác minh |
|---|---|
| Đường truy cập | `GET /api/org-units/tree` (đọc cây tổ chức) · `POST /api/org-units/tree` (**tạo** đơn vị/bộ phận) |
| Ai truy cập được | Mọi tài khoản đã đăng nhập |
| Kiểm tra quyền | `POST` **không** có `checkPermission("org.manage")`, **không** kiểm tra vai trò ⇒ **mọi cán bộ đều tạo được đơn vị** mới (chỉ cần `code` + `name` hợp lệ, `parentId` tồn tại) |
| Đọc ngoài phạm vi? | `GET` trả **cây tổ chức toàn hệ thống** — chấp nhận được (cần cho bộ chọn đơn vị), nhưng cũng lộ cơ cấu đơn vị của toàn tổ chức |
| Ghi ngoài phạm vi? | **CÓ** — tạo đơn vị mới trong cây tổ chức |
| Ảnh hưởng tài khoản thực tế | Cán bộ tạo được đơn vị "ma" ⇒ xuất hiện trong mọi danh sách chọn đơn vị (kế hoạch, nhiệm vụ, lịch trực) ⇒ gây rối dữ liệu tổ chức; không trực tiếp chiếm quyền nhưng **phá vỡ mô hình tổ chức** |
| Khắc phục tối thiểu | `POST /api/org-units/tree`: thêm `checkPermission(user, "org.manage")` (quyền đã tồn tại, hiện `UNIT_LEADER` có sẵn) + `SYSTEM_ADMIN` không tạo đơn vị nghiệp vụ. **Không** chặn `GET` |
| Chức năng hợp lệ bị khóa nhầm | Cán bộ từng tự tạo đơn vị (nếu có) sẽ không tạo được nữa ⇒ cần thông báo; kiểm tra dữ liệu hiện có: `org_units` = 8 đơn vị (xem metadata) |
| Test | (1) `STAFF` POST tree ⇒ 403; (2) `UNIT_LEADER` POST ⇒ 201; (3) `GET` không đổi; (4) số dòng `org_units` không đổi |

### M4 — Bypass toàn quyền của `UNIT_LEADER` 🔴 (cao, đổi hành vi)

| Hạng mục | Xác minh |
|---|---|
| Vị trí | `src/server/guard.ts:28-33` (`checkPermission`) và `:52-57` (`getAuthorizedUnitIds`) |
| Hành vi | `checkPermission`: `UNIT_LEADER` ⇒ **true cho mọi quyền** trừ `system.config` · `getAuthorizedUnitIds`: `UNIT_LEADER` ⇒ `"ALL"` ⇒ mọi `where` theo đơn vị đều **không lọc** |
| Hệ quả thực tế | 3 tài khoản `UNIT_LEADER` (2 thật + 1 demo) xem/sửa **toàn bộ** dữ liệu mọi đơn vị: nhiệm vụ, đầu việc, kế hoạch, kết quả tháng, chỉ tiêu, lịch trực, văn bản, giao ban |
| Có thể bị lạm dụng? | Không thể **chiếm quyền của người khác** ngoài đơn vị mình nếu lãnh đạo cố ý — nhưng **mọi thao tác của lãnh đạo đều ghi vào audit** ⇒ rủi ro lộ dữ liệu liên bộ phận hơn là chiếm quyền |
| Khắc phục tối thiểu | **Không sửa `checkPermission`** (giữ quyền cấp theo vai trò) mà **thu hẹp phạm vi**: `getAuthorizedUnitIds` cho `UNIT_LEADER` trả `[scopeUnitId] ∪ cây con` (nếu `scopeType=SUBTREE`) thay vì `"ALL"`. Đây là **thay đổi hành vi rõ ràng** ⇒ phải xin Hải quan xác nhận (Q-RB1) |
| Chức năng hợp lệ bị khóa nhầm | Lãnh đạo đơn vị xem được báo cáo **tổng hợp toàn chi cục** hiện nay sẽ không còn ⇒ cần báo trước |
| Test | (1) lãnh đạo đơn vị A **không** thấy dữ liệu đơn vị B; (2) vẫn thấy đủ đơn vị của mình; (3) `SYSTEM_ADMIN` vẫn không thấy dữ liệu nghiệp vụ; (4) báo cáo tổng hợp cấp chi cục: xác nhận với Hải quan |

### M5 — `SessionUser.role` chỉ lấy vai trò đầu tiên 🟠 (trung bình, không phải leo thang)

| Hạng mục | Xác minh |
|---|---|
| Vị trí | `src/server/auth.ts:131` (`const primaryGrant = account.roleGrants[0]`) và `:147` (`role: primaryGrant?.role.code \|\| decoded.role`) |
| Vấn đề | Truy vấn `roleGrants` **không có `orderBy`** ⇒ `roleGrants[0]` là **thứ tự DB, không xác định** ⇒ cùng một tài khoản có thể "đóng vai" khác nhau giữa các lần gọi |
| Ai bị ảnh hưởng | `cb002` (STAFF + DEPARTMENT_LEADER). Nếu `role` rơi vào `STAFF`: mất `isTaskLeader` (trưởng bộ phận) ⇒ **không** duyệt/trả lại được ⇒ mất quyền, **không** phải leo thang. `permissions[]` vẫn là **hợp** cả hai vai trò ⇒ các route dùng `checkPermission` vẫn đúng |
| Hướng ảnh hưởng | **Fail-closed** (mất quyền) — trừ khi `checkPermission` có bypass theo `role` (UNIT_LEADER/SYSTEM_ADMIN): nếu ai đó có `UNIT_LEADER` ở grant thứ 2 mà grant đầu là `STAFF` ⇒ **mất** quyền lãnh đạo (fail-closed) — vẫn an toàn |
| Khắc phục tối thiểu | `orderBy: { createdAt: "asc" }` cho `roleGrants` + `roles: []` trong `SessionUser`; các kiểm tra theo vai trò chuyển sang `hasAnyRole(user, [...])`. Đây là **bản vá không đổi hành vi** nếu chọn "vai trò mạnh nhất theo thứ tự ưu tiên" ⇒ cần thứ tự ưu tiên do Hải quan chốt (Q-RB3) |
| Test | Người 2 vai trò: `roles[]` chứa cả 2; `checkPermission` hợp; `hasRole("DEPARTMENT_LEADER")` true; thứ tự grant **không** ảnh hưởng kết quả |

### M6 — Lệch giữa `canDo()` (FE) và `checkPermission()` (BE) 🟡 (thấp–TB)

| Hạng mục | Xác minh |
|---|---|
| So sánh | FE `usePermissions.ts:20-27` `SYSTEM_ADMIN_TECH` **= 6 mã** `org.manage, catalog.manage, audit.view, system.config, form.manage, users.manage` — **giống hệt** BE `guard.ts:16-23` `SYSTEM_ADMIN_PERMISSIONS` ✔ |
| Khác biệt thật | Cả hai đều dùng `user.role` (**một chuỗi, = grant[0]**) ⇒ với người đa vai trò, FE và BE **cùng sai theo cùng cách** ⇒ hiện tại **chưa lệch**, nhưng sẽ lệch ngay khi BE chuyển sang `roles[]` mà FE chưa chuyển |
| Rủi ro thực tế | Hiện tại: thấp. Tương lai: cao nếu triển khai G1–G2 mà chưa đồng bộ FE ⇒ **nút hiện nhưng API từ chối** (UX lỗi) hoặc ngược lại |
| Khắc phục tối thiểu | `canDo()` **nhận `user.roles[]`** và dùng **cùng một hàm quyết định** với BE: dùng `permissions[]` (đã hợp) + `roles[]` cho các ngoại lệ. Đồng thời: `/api/auth/me` phải trả `roles[]` |
| Test | Bộ test chéo: với 4 vai trò mẫu × 30 mã quyền, **kết quả `canDo()` phải bằng** kết quả `checkPermission()` (gọi API thật) |

### Bảng tổng hợp mức rủi ro & loại việc

| Mã | Vấn đề | Mức | Loại | Có thể vá độc lập? | Cần chính sách Hải quan? |
|---|---|---|---|---|---|
| M3 | `POST /api/org-units/tree` không kiểm tra quyền | 🔴 | **Lỗ hổng** | ✅ **Có** (dùng quyền `org.manage` sẵn có) | ❌ Không (chỉ siết, không mở rộng) |
| M4 | Bypass toàn quyền + toàn phạm vi của `UNIT_LEADER` | 🔴 | **Hành vi** | ⚠️ Có, nhưng **đổi hành vi** | ✅ **Có** (Q-RB1) |
| M1 | Metric không có chiều đơn vị (ghi đè chéo đơn vị) | 🔴 | **Mô hình dữ liệu** | ⚠️ Chỉ vá hạn chế (creator-only) | ✅ **Có** (chỉ tiêu cấp cục hay cấp đơn vị?) |
| M2 | Sub-route `[id]` của snapshots chưa rà | 🟠 | **Chưa xác minh** | — | — |
| M5 | `role_grants[0]` không xác định | 🟠 | **Lỗi hành vi (fail-closed)** | ✅ Có (`roles[]` + `hasAnyRole`) | ⚠️ Cần thứ tự ưu tiên vai trò (Q-RB3) |
| M6 | FE/BE dùng chung `role` đơn lẻ | 🟡 | **Nợ kỹ thuật** | ✅ Có (đồng bộ khi làm G1–G2) | ❌ Không |

---

## 2. ĐỀ XUẤT BẢN VÁ BẢO MẬT PHẠM VI NHỎ (TÁCH BIỆT KHỎI MODULE RBAC)

**Nguyên tắc:** chỉ **siết** quyền đã vượt, **không** thêm quyền cho ai; **không** đổi schema; **không** chạm F1–F5; **không** chạm module RBAC (G0–G7); có cờ bật/tắt.

| Vạn | Nội dung | Cờ | Rollback | Rủi ro hành vi |
|---|---|---|---|---|
| **P1** | `POST /api/org-units/tree`: thêm `checkPermission(user, "org.manage")` + chặn `SYSTEM_ADMIN` tạo đơn vị nghiệp vụ | `RBAC_HARDEN_ORGUNIT_CREATE` | Tắt cờ | Cán bộ từng tự tạo đơn vị ⇒ bị chặn (cần rà `org_units` hiện có: 8 đơn vị) |
| **P2** | `POST /api/metrics/entries`: chỉ cho **người đã tạo** bản ghi sửa bản ghi `DRAFT/RECORDED`; người khác ⇒ 409 + ghi chú; lãnh đạo (`canConfirm`) không đổi | `RBAC_HARDEN_METRIC_ENTRY_OWNER` | Tắt cờ | Chặn việc sửa nháp chéo người trong cùng đơn vị |
| **P3** | `PATCH/DELETE /api/roles`… **không làm** (chưa có API) | — | — | — |
| **P4** | `role_grants` thêm `orderBy: { createdAt: "asc" }` để `role` **xác định** (không đổi hành vi hôm nay, chỉ bỏ tính ngẫu nhiên) | `RBAC_DETERMINISTIC_PRIMARY_ROLE` | Tắt cờ | Chọn "vai trò cũ nhất" làm vai trò chính — cần thống nhất thứ tự ưu tiên (Q-RB3) |
| **P5** | `getAuthorizedUnitIds`: `UNIT_LEADER` ⇒ `[scopeUnitId]` (+ cây con nếu `SUBTREE`) thay vì `"ALL"` | `RBAC_NARROW_LEADER_SCOPE` | Tắt cờ | 🔴 **Thay đổi hành vi rõ ràng** — chỉ bật sau khi Hải quan xác nhận Q-RB1 |
| **P6** | Bổ sung `roles[]` vào `SessionUser` + `/api/auth/me` (bổ sung, **không** xoá `role` cũ) | `RBAC_ROLES_ARRAY` | Tắt cờ | Không đổi hành vi |
| **P7** | Rà & vá sub-route `/api/reports/snapshots/[id]` (PUT/PATCH/DELETE/verify) nếu có lỗ hổng | `RBAC_HARDEN_SNAPSHOT_ITEM` | Tắt cờ | Chặn sửa bản chốt số liệu của người khác |

**Quy trình áp dụng P1–P2 (vá độc lập, được phép chạy ngay sau khi duyệt):**
1. Backup + restore-test.
2. Bật cờ trên **DB local** → chạy bộ test P1/P2 → đối chiếu hành vi.
3. Bật cờ trên Production → smoke **chỉ đọc** (không POST).
4. **Điểm dừng UAT**: người kiểm thử thử tạo đơn vị (kỳ vọng bị từ chối với thông báo rõ) và sửa số liệu nháp của người khác.

> **Không** gộp P5/P6/P7 vào bản vá nhỏ — chúng thuộc phạm vi G0–G7 và cần chính sách.

---

## 3. RÀ SOÁT CƠ CHẾ TRIỂN KHAI (mục E)

### 3.1. `SYSTEM_ADMIN` có 0 `role_grants` — đường quản trị ngoài RBAC nào tồn tại?

| Câu hỏi | Xác minh |
|---|---|
| Quyền của `SYSTEM_ADMIN` đến từ đâu? | **Không** từ `role_grants` mà từ **hard-code** `SYSTEM_ADMIN_PERMISSIONS` (`guard.ts:16-23`) được `checkPermission` (`:36-41`) áp dụng. `permissions[]` của họ = hợp `role_permissions` qua các grant — **không có grant ⇒ rỗng** |
| Có đường quản trị nào ngoài RBAC? | **Có** — `/api/people/[id]/account` (tạo/tài khoản), `/api/people/[id]/account/status`, `/api/people/[id]/account/reset-password`, `/api/people/[id]/transfer`, `/api/org-units/[id]`, `/api/positions/**` đều dùng `checkPermission("org.manage"/"users.manage")` ⇒ `SYSTEM_ADMIN` **có** quyền này (nằm trong 6 mã) |
| Rủi ro | `SYSTEM_ADMIN` **không** đọc dữ liệu nghiệp vụ (`getAuthorizedUnitIds` trả `[]` khi không phải tác vụ quản trị tổ chức — `guard.ts:54`) ✔ an toàn. Nhưng **quyền quản trị vai trò** (`roles.manage`) chưa tồn tại ⇒ khi thêm UI, phải bảo đảm `SYSTEM_ADMIN` **không** tự cấp quyền nghiệp vụ cho mình |
| Bootstrap tài khoản quản trị | `scripts/demo-accounts.ts` (tạo tài khoản demo với mật khẩu ngẫu nhiên, lưu `demo-ops/demo-secrets.json`) và `scripts/demo-local-test-accounts.ts` (`LocalTest@2026`). **Không có** tài khoản quản trị "gốc" được tạo tự động trong Production ⇒ khi thêm `roles.manage` phải bảo đảm có ít nhất 1 tài khoản có quyền này (đề xuất: gán `SYSTEM_ADMIN` + **1 `UNIT_LEADER`** để không phụ thuộc một người) |
| Mất quyền đăng nhập khi triển khai? | Rủi ro thấp nếu G0 **chỉ thêm** permission (không sửa/xoá) và **giữ nguyên** `checkPermission` cũ trong G1–G2. Rủi ro thật ở **G5** (bỏ bypass `UNIT_LEADER`): nếu chưa cấp đủ quyền qua DB, lãnh đạo **mất** quyền nghiệp vụ ⇒ bắt buộc chạy `T-RBAC-01` (so sánh tập quyền 4 vai trò) **trước** khi bật cờ G5 |
| Ngăn tự nâng quyền / leo thang | Chưa có cơ chế nào (chưa có UI). Đề xuất (YC39_03 §7): (1) không cấp quyền vượt quyền của mình; (2) cấm tự gán/gỡ `roles.manage`; (3) `roles.isSystem` bất biến; (4) mọi thao tác ghi `role_audits` + `audit_events`; (5) `SYSTEM_ADMIN` không có quyền nghiệp vụ |

### 3.2. Thay đổi quyền có hiệu lực với phiên/JWT hiện tại thế nào?

| Cơ chế | Hiện trạng |
|---|---|
| JWT chứa `role`, `permissions`, `scopeType` | Có (ký lúc đăng nhập, `auth.ts:42`) |
| `authenticateRequest` nạp lại từ DB **mỗi request** | Có (`auth.ts:109-155`) ⇒ **đổi quyền có hiệu lực ngay** (trừ cache 60s, `auth.ts:153`) |
| Cache 60s | `authMemoryCache` — người dùng đang đăng nhập ⇒ **tối đa 60s** mới thấy quyền mới; thu hồi quyền cũng chậm tối đa 60s |
| Đăng xuất bắt buộc? | Không bắt buộc (JWT vẫn hợp lệ) ⇒ **thu hồi quyền tối đa 60s**; với quyền nhạy cảm nên có cơ chế vô hiệu cache theo account khi có thay đổi (đề xuất G7) |
| Frontend cache | `usePermissions` cache theo `id::role` + TTL ⇒ sau khi quyền đổi, FE cần `refreshPermissions()` (đã có hàm) — nên gọi sau khi quản trị đổi quyền |

### 3.3. Vai trò nào được sửa / cần bảo vệ

| Role | `isSystem` | Sửa được? | Khuyến nghị |
|---|---|---|---|
| `STAFF` | ✔ | Không (mã) | Chỉ bật/tắt quyền, có thể thêm vai trò tùy chỉnh kế thừa |
| `DEPARTMENT_LEADER` | ✔ | Không (mã) | Như trên |
| `UNIT_LEADER` | ✔ | Không (mã) | Bảo vệ bổ sung: cấm cấp `system.config`/`roles.manage` trừ khi có cờ `allowSystemRoleEdit` do Hải quan bật |
| `SYSTEM_ADMIN` | ✔ | Không (mã) | Không được cấp quyền nghiệp vụ; không tự nâng |
| *(tùy chỉnh)* | — | ✔ Được | Cấp quyền ⊆ quyền của người quản trị |

---

## 4. KHUYẾN NGHỊ THỨ TỰ TRIỂN KHAI & ĐIỂM DỪNG UAT

| Hạng mục | Loại | Điểm dừng UAT | Ghi chú |
|---|---|---|---|
| **P1** (chặn tạo đơn vị) | Vá độc lập | Sau P1: thử tạo đơn vị bằng tài khoản cán bộ ⇒ phải bị từ chối kèm thông báo dễ hiểu | Không cần chính sách mới |
| **P2** (chặn sửa số liệu nháp của người khác) | Vá độc lập | Sau P2: cán bộ thử sửa ô nháp của người khác ⇒ bị từ chối rõ ràng; vẫn sửa được ô của mình | Cần thông báo cho bộ phận |
| **P4** (grant có thứ tự xác định) | Vá nhỏ | Không cần dừng UAT (không đổi hành vi) | Kèm `roles[]` ở P6 |
| **P6** (`roles[]` bổ sung) | Nền tảng G1 | Không cần dừng UAT | Bật song song, `role` cũ giữ nguyên |
| **P7** (vá snapshots `[id]`) | Vá độc lập — **sau khi rà** | Sau P7: cán bộ thử sửa bản chốt số liệu của đơn vị khác ⇒ bị từ chối | Chỉ vá nếu rà ra lỗ hổng |
| **P5** (thu hẹp phạm vi lãnh đạo) | **Đổi hành vi** | ⛔ Chỉ bật sau khi Hải quan xác nhận Q-RB1; dừng UAT để lãnh đạo kiểm tra lại phạm vi xem báo cáo | **Không** gộp vào bản vá nhỏ |
| **G0–G2, G4** (chuẩn hóa quyền, siết phạm vi) | Giai đoạn RBAC | Dừng UAT sau **mỗi module** (so sánh hành vi trước/sau) | Cần script đối chiếu |
| **G5** (bỏ bypass) | Đổi hành vi rõ | ⛔ Dừng UAT: lãnh đạo xác nhận vẫn đủ quyền | Chỉ bật sau T-RBAC-01 xanh |
| **G6–G7** (UI quản trị vai trò) | Tính năng mới | Dừng UAT sau từng màn hình | Cần Q-RB3 |

---

## 5. RỦI RO THAY ĐỔI QUYỀN TRÊN PRODUCTION (tổng hợp)

| Rủi ro | Xác suất | Tác động | Giảm thiểu |
|---|---|---|---|
| Vô tình **mất quyền** khi bỏ bypass `UNIT_LEADER` (G5) | TB | Lãnh đạo mất toàn quyền nghiệp vụ | T-RBAC-01 + bật cờ tuần tự + rollback tức thì |
| Vô tình **mở rộng quyền** khi cấp permission mới (G0) | TB | Cán bộ có quyền chưa từng có | Script đối chiếu quyền trước/sau; chỉ cấp bằng hành vi hardcode hiện tại |
| Tác động **báo cáo tổng hợp** khi thu hẹp phạm vi lãnh đạo (P5) | TB | Báo cáo cấp chi cục biến mất | Cần Q-RB1 + thông báo + điểm dừng UAT |
| Chặn nhầm **tạo đơn vị** (P1) | Thấp | Bộ phận không tạo được đơn vị mới | Rà `org_units`; thông báo |
| Chặn nhầm **sửa số liệu nháp** (P2) | TB | Bộ phận phải chờ lãnh đạo sửa | Cho phép lãnh đạo sửa; thông báo |
| Role/grant **không xác định** khi nhiều vai trò (P5/M5) | Thấp | Lãnh đạo bộ phận mất quyền nghiệp thu | `roles[]` + `hasAnyRole` + thứ tự ưu tiên |
| Đồng bộ FE/BE lệch khi chuyển `roles[]` (M6) | TB | Nút hiện nhưng API từ chối | `canDo` dùng cùng nguồn quyền; test chéo |
| Khóa nghiệp vụ bị **nới** khi chuyển sang quyền | Thấp | Người tự duyệt việc của mình | F1–F5 là lớp riêng, **không** nằm trong `checkPermission`; test 15 assertion giữ nguyên |

> **Nguyên tắc bất di bất dịch:** mọi bước trong bảng này phải **rollback được bằng cờ** và **không** được vô tình mở lại quyền đã bị siết. Cờ chỉ **siết** (mặc định tắt) trừ khi có ghi chú "bật kèm" trong tài liệu phê duyệt.
