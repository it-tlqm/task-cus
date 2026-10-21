# YC-39 · BƯỚC 01 — AUDIT PHÂN QUYỀN HIỆN TẠI

**Dự án:** TALUNG-CUS-WORK · **Ngày:** 21/10/2026 · **Production:** `5901199` (`db=up`)
**Chế độ:** CHỈ ĐỌC — không sửa code nghiệp vụ, không migration, không thêm/sửa/xoá Role·Permission·User,
không đổi quyền tài khoản, không reset mật khẩu, không ghi request lên Production, không deploy.
**Phạm vi kiểm kê:** toàn bộ `src/` (87 route API, 37 màn hình) + schema + dữ liệu Production (SELECT).

> Quy ước: **[X]** = đã xác minh bằng đọc mã nguồn hoặc truy vấn SELECT · **[GĐ]** = giả định cần kiểm chứng thêm.

---

## 1. KIẾN TRÚC HIỆN TẠI (TÓM TẮT)

```
[Browser] ──► middleware.ts ──► Route handler (app/api/**/route.ts)
   │  JWT (Bearer header hoặc cookie "token")        │  authenticateRequest(req) → SessionUser
   │  PUBLIC_API_PREFIXES: /api/auth/login,          │  ├─ role: string   (role_grants[0].role.code)
   │  /api/auth/me, /api/health                      │  ├─ permissions: string[]  (hợp quyền mọi grant)
   ▼                                               │  ├─ scopeType / scopeUnitId (role_grants[0])
[Page] ──► usePermissions() ──► GET /api/auth/me    │  └─ personId, unitId
```

**Cơ chế xác thực (đã xác minh)**
| Hạng mục | Thực tế |
|---|---|
| Cơ chế | JWT ký bằng `jsonwebtoken` — `src/server/auth.ts:42-49` (`signToken`/`verifyToken`) |
| Thời hạn token | 8h (không "ghi nhớ") / 7d (remember) — `auth.ts:43` |
| Bí mật | `JWT_SECRET` từ env; **Production thiếu ⇒ ném lỗi** (`auth.ts:8-15`) — hành vi đúng |
| Nạp quyền | `authenticateRequest()` **đọc lại từ DB mỗi request** (`auth.ts:109-155`), cache bộ nhớ 60s ⇒ đổi quyền có hiệu lực gần như tức thì |
| Hợp quyền nhiều vai trò | `permissions` = **hợp** mọi `role_grants` ⇒ nhiều vai trò **đã được hỗ trợ** cho phần quyền |
| `role` trong `SessionUser` | = `role_grants[0].role.code` ⇒ **chỉ vai trò đầu tiên** dùng cho các kiểm tra theo vai trò |

---

## 2. BẢNG DỮ LIỆU & QUAN HỆ (đã xác minh trên Production)

```
Organization 1──n OrgUnit (cây: parentId, level) ──n PersonAssignment ──n Person ──1 Account
                                                                                │
                                            roles ◄── role_grants ────────────┘
                                             │  (accountId, roleId, scopeType, scopeUnitId, validFrom, validTo)
                                             └── role_permissions ──► permissions
```

| Bảng | Model | Trường quyết định | Số bản ghi |
|---|---|---|---|
| `roles` | `Role` | `code` (unique), `name`, `isSystem` | **4** |
| `permissions` | `Permission` | `code` (unique), `name`, `module` | **11** |
| `role_permissions` | `RolePermission` | (`roleId`,`permissionId`) | **31** |
| `role_grants` | `RoleGrant` | `accountId`, `roleId`, `scopeType`, `scopeUnitId`, `validFrom`, `validTo` | **25** |
| `accounts` | `Account` | `username`, `passwordHash`, `status`, `mfaEnabled` | **24** |
| `person_assignments` | `PersonAssignment` | `personId`, `unitId`, `positionId`, `isPrimary`, `effectiveFrom/To` | 30 |
| `org_units` | `OrgUnit` | `code`, `level`, `parentId` | 8 |

**Phát hiện quan trọng:** hạ tầng RBAC **đã tồn tại đầy đủ** (kể cả `scopeType` và `validFrom/validTo` cho ủy quyền có thời hạn).
YC-39 chủ yếu là **nối và chặn**, không phải dựng lại từ đầu.

### 2.1. Role hiện có (4, đều `isSystem=true`)

| `code` | Tên | Số permission | Số grant | Ghi chú |
|---|---|---|---|---|
| `SYSTEM_ADMIN` | Quản trị hệ thống | 10 | **0** | Quyền đến từ hard-code `SYSTEM_ADMIN_PERMISSIONS` (`guard.ts:16-23`) |
| `UNIT_LEADER` | Trưởng hải quan cửa khẩu | 11 | 3 | `checkPermission` trả **true cho mọi quyền trừ `system.config`** (`guard.ts:28-33`) |
| `DEPARTMENT_LEADER` | Trưởng bộ phận | 7 | 3 | Chỉ có quyền được cấp + phạm vi `DEPARTMENT` |
| `STAFF` | Công chức | 3 | 19 | Chỉ có quyền được cấp + phạm vi `DEPARTMENT` |

### 2.2. Permission hiện có (11, 7 module)

| Module | Mã quyền |
|---|---|
| AUDIT | `audit.view` |
| CATALOG | `catalog.manage` |
| ORG | `org.manage` |
| PLANS | `plans.approve`, `plans.create`, `plans.view` |
| REPORTS | `reports.export`, `reports.view` |
| SYSTEM | `system.config` |
| TASKS | `tasks.assign`, `tasks.update_own` |

> **Không có** permission nào cho: monthly-results, scoring, evaluations, routine, rosters, leaves, docs,
> meetings, giao-ban, metrics, work-evidence, notifications, reports.snapshots, approvals, supervisions, work-item, people…
> → Các module này **không dùng cơ chế quyền**, chỉ dựa vào kiểm tra vai trò/phạm vi viết tay.

### 2.3. Phân công quyền trên Production (25 grant, 24 tài khoản)

| Tiêu chí | Kết quả |
|---|---|
| Tài khoản **không** có `role_grants` | **0/24** ✔ |
| Tài khoản có **nhiều** vai trò | **1** (`cb002`: STAFF + DEPARTMENT_LEADER) |
| `scopeType` đang dùng | `ORGANIZATION` (3), `DEPARTMENT` (22) |
| `scopeType` **chưa** dùng | `OWN`, `ASSIGNED`, `SUBTREE` — *đã có trong schema, chưa dùng ở đâu* |
| Grant đã **hết hạn** (`validTo`) | 1 (`cb002` STAFF, `validTo = validFrom`) |
| `validTo` tương lai (ủy quyền tạm) | 0 |
| `SYSTEM_ADMIN` có grant | **0** (quyền đến từ hard-code) |

---

## 3. VAI TRÒ ĐƯỢC HARDCODE Ở ĐÂU

| Nơi | Cơ chế | Rủi ro |
|---|---|---|
| `src/server/guard.ts:28` | `user.role === "UNIT_LEADER"` ⇒ **toàn quyền** (trừ `system.config`) | Lãnh đạo đơn vị **vượt qua** mọi permission DB; không thu hẹp được |
| `src/server/guard.ts:36` | `user.role === "SYSTEM_ADMIN"` ⇒ chỉ 6 quyền kỹ thuật + quyền DB | An toàn, nhưng **không kiểm soát được** bằng DB |
| `src/server/guard.ts:52` | `user.role === "UNIT_LEADER" \|\| scopeType === "ORGANIZATION"` ⇒ `"ALL"` (toàn đơn vị) | Rộng; `SYSTEM_ADMIN` trả `[]` (không đọc nghiệp vụ) ✔ |
| `src/hooks/usePermissions.ts:83-95` | `canDo()` **lặp lại** logic bypass của backend | **Lệch backend**: frontend có `SYSTEM_ADMIN_TECH` riêng ⇒ nguy cơ hiển thị nút mà backend từ chối (hoặc ngược lại) |
| **159 dòng** so sánh `role` trong **53 file** | rải rác khắp `app/api/**` | Không kiểm kê được; dễ sót |
| `src/server/auth.ts:147` | `role = role_grants[0].role.code` | Người nhiều vai trò chỉ được "đóng vai" bằng vai trò đầu |

**Bảng hardcode theo module (top):** `personal-work-items` 12 · `plans/[id]/workflow` 10 · `leaves` 7 ·
`supervisions` 7 · `guard.ts` 7 · `monthly-results` 6 · `rosters` 6 · `scoring` 6 · `usePermissions` 6 ·
`department-work-items` 5 · `rosters/positions` 5 · `snapshots` 4 · `admin/system/config` 3 · `docs` 3 ·
`people/[id]/account` 3 · `tasks` 3.

---

## 4. GUARD TẠI BACKEND — TIÊU CHÍ ĐANG DÙNG

| Guard | Vị trí | Tiêu chí | Ghi chú |
|---|---|---|---|
| `authenticateRequest(req)` | `server/auth.ts:69` | Token hợp lệ + nạp lại grant/permission từ DB | Nền tảng mọi route |
| `checkPermission(user, code)` | `server/guard.ts:25` | So với `permissions[]` (có bypass UNIT_LEADER / SYSTEM_ADMIN) | Dùng **46 lần** |
| `getAuthorizedUnitIds(user)` | `server/guard.ts:47` | `ORGANIZATION`→ALL · `SUBTREE`→ cây đơn vị · mặc định→`[scopeUnitId]` | Dùng để lọc `where` |
| `buildScopedWhereClause(user, field)` | `server/guard.ts:83` | `{field: {in: units}}` | Lọc danh sách |
| `verifyTaskAccess(user, id, READ\|WRITE)` | `server/guard.ts:97` | UNIT_LEADER→toàn bộ · DEPT_LEADER+đơn vị · **chủ trì** hoặc **người được phân công** (WRITE) · cùng đơn vị (READ) | Chống IDOR tốt nhất hiện có |
| `isTaskLeader(user, unitId)` | `server/task-transitions.ts` | UNIT_LEADER · DEPT_LEADER+đơn vị · có `tasks.approve` | Dùng cho nghiệm thu/trả lại |
| `assertTaskStatusTransition(...)` | `server/task-transitions.ts` | Luật chuyển trạng thái + khoá nhiệm vụ kết thúc (F1–F5) | Lớp nghiệp vụ đúng nhất hiện có |
| `middleware.ts` | 112 dòng | Chỉ kiểm tra **token hợp lệ**, trả 401 cho API, 307 cho trang | **Không** kiểm tra quyền/role |

---

## 5. KIỂM KÊ PHÂN QUYỀN THEO MODULE (A–J)

> Cột "Guard backend" ghi các cơ chế thực sự dùng trong file route. "Phạm vi" = cách lọc dữ liệu.
> Chỉ ghi thao tác **có thật** trong chức năng.

### A. Tổng quan / Dashboard / Giao ban / Báo cáo / Biên bản

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/dashboard` | `GET /api/dashboard/kpi` | READ | role ≠ SYSTEM_ADMIN | `getAuthorizedUnitIds` | `role==="SYSTEM_ADMIN"` → ẩn | `unitScope` | Ổn; KPI theo đơn vị |
| `/giao-ban`, `/giao-ban/nhap`, `/giao-ban/bao-cao`, `/giao-ban/cau-hinh` | `GET/POST /api/ai`, `GET/POST /api/metrics/*`, `GET /api/reports/summary`, `GET /api/reports/export` | READ/REPORT | role | metrics **không lọc đơn vị**; export có `reports.export` | `can("reports.export")` | `perm` + `unitScope` | ⚠️ `/metrics/entries` **không** có `checkPermission`/`unitScope` ⇒ cán bộ đơn vị A có thể thấy/ghi số liệu đơn vị B |
| `/reports`, `/reports/excel`, `/reports/snapshots` | `GET /api/reports/summary`, `/api/reports/export`, `/api/reports/snapshots/**` | READ/EXPORT/CREATE/UPDATE/DELETE | `reports.view`/`reports.export` | summary+export có `unitScope`; **snapshots không** | `can()` | `perm` (summary/export) | ⚠️ `/reports/snapshots` GET/POST/PUT/PATCH/DELETE **không** có `checkPermission` **và** không lọc đơn vị |
| `/calendar` | `GET /api/dashboard/kpi` | READ | role | unit | – | unitScope | Ổn |

### B. Nhật ký công việc / Công việc cá nhân / Kế hoạch / Phân công

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/my-work` | `GET/POST/PATCH /api/tasks`, `POST /api/tasks/[id]/updates`, `POST /api/tasks/[id]/attachments`, `.../comments` | READ/CREATE/UPDATE/SUBMIT | chủ trì / phối hợp / lãnh đạo | `verifyTaskAccess` (IDOR) | ẩn nút theo `role`+`isSelfInitiated` | `taskScope` + `unitScope` | ✔ tốt nhất hệ thống |
| `/tasks` | `GET/POST/PATCH /api/tasks` | READ/CREATE/ASSIGN/APPROVE/EXTEND | lãnh đạo (duyệt) | `verifyTaskAccess` | `canApprove` | `taskScope` | ✔ |
| `/tasks/[id]` | `GET/PATCH /api/tasks/[id]`, `.../updates`, `.../deadline-request`, `.../remind`, `.../comments`, `.../attachments` | READ/UPDATE/SUBMIT/EXTEND/COMMENT | theo vai trò | `verifyTaskAccess` | `isLockedTask` | `taskScope` + F1–F5 | ✔ |
| `/plans`, `/plans/[id]` | `GET/POST /api/plans`, `POST /api/plans/[id]/workflow` | READ/CREATE/APPROVE | `plans.create`/`plans.approve` | `unitScope` | `can("plans.approve")` | `perm` + `unitScope` | ⚠️ `POST /api/plans` không `checkPermission("plans.create")` |
| `/my-work` → *Đầu việc cá nhân* | `GET/POST/PATCH/DELETE /api/personal-work-items` | READ/CREATE/UPDATE/DELETE | chủ trì / lãnh đạo | `getAuthorizedUnitIds` + `checkWorkItemAccess` | role | `unitScope` + 12 chỗ hardcode role | ⚠️ nhiều nhánh so sánh vai trò rải rác; cần rà IDOR theo từng nhánh |

### C. Phê duyệt / Nghiệm thu / Trả lại / Gia hạn

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/approvals` | `GET /api/approvals/cases`, `GET /api/approvals/[caseType]/[id]/preview`, `POST .../decision`, `POST .../response` | READ/DECIDE/RESPOND | lãnh đạo có thẩm quyền | `server/approval-case.ts` (`canDecide`, `resourceOwnerId`) | `canDecide` | `verifyTaskAccess` + `canDecide` | ⚠️ `/approvals/cases` **không** lọc theo đơn vị ở route (lọc ở `approval-case.ts`) |
| `/my-work` (gia hạn) | `POST /api/tasks/[id]/deadline-request`, `POST .../[reqId]/review` | CREATE/REVIEW | cán bộ / lãnh đạo | `taskScope` | – | `taskScope` + F4 | ✔ |

### D. Tác nghiệp / Lịch trực / Lịch công tác / Nghỉ phép / Văn bản

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/routine` | `GET/POST /api/routine` | READ/CREATE | cán bộ | `unitScope` | – | `unitScope` | ✔ |
| `/roster` | `GET/POST/PATCH/DELETE /api/rosters`, `/rosters/positions`, `/rosters/day-info`, `/rosters/export` | CRUD/EXPORT | lãnh đạo | theo vai trò (6 chỗ hardcode) | role | `role` (không `perm`) | ⚠️ không dùng permission; phạm vi đơn vị phụ thuộc so sánh role |
| `/leaves` | `GET/POST/PATCH /api/leaves` | READ/CREATE/APPROVE | cán bộ / lãnh đạo | 7 chỗ hardcode role | role | `role` + `unitScope` | ⚠️ |
| `/docs` | `GET/POST/PATCH /api/docs` | READ/CREATE/UPDATE | cán bộ | `unitScope` | – | `unitScope` | ✔ |
| `/meetings`, `/meetings/[id]` | `GET/POST /api/meetings`, `.../[id]` | READ/CREATE/UPDATE | cán bộ | `unitScope` | – | `unitScope` | ✔ |

### E. Kết quả công tác tháng / Tổng hợp báo cáo / Đánh giá – xếp loại

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/monthly-results` | `GET/POST/PATCH /api/monthly-results` | READ/CREATE/UPDATE | cán bộ (của mình) / lãnh đạo (đơn vị) | 6 chỗ hardcode role | role | `role` | ⚠️ không có permission riêng; phạm vi theo vai trò |
| `/admin/supervisions` | `GET/POST/DELETE /api/supervisions` | READ/CREATE/DELETE | lãnh đạo | `checkPermission` + `unitScope` | `can("org.manage")` | `perm` | ✔ |
| `/reports` (bảng điểm 01A/01B) | `GET /api/evaluation-export`, `/api/scoring/*` | READ/EXPORT | lãnh đạo | `perm` + `unitScope` | – | `perm` | ✔ |

### F. Danh mục TX / Sản phẩm QĐ1277 / Biểu mẫu

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/admin/catalog`, `/admin/forms`, `/products` | `GET/POST/PATCH/DELETE /api/work-catalog/**`, `/api/catalog/templates/**`, `/api/products` | READ/IMPORT/MANAGE | `catalog.manage` | toàn hệ thống | `can("catalog.manage")` | `perm` | ✔ (`/products` chỉ READ, mở cho mọi role) |

### G. Tổ chức & nhân sự / Tài khoản

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/admin/organization` | `GET/POST /api/org-units/tree`, `PATCH/DELETE /api/org-units/[id]`, `/api/positions/**`, `/api/people/**` | READ/CREATE/UPDATE/DELETE | `org.manage` / `users.manage` | `unitScope` cho people | `can("org.manage")` | `perm` | ⚠️ `GET /api/org-units/tree` **không** `checkPermission` (chỉ role) |
| `/admin` (tài khoản) | `POST /api/people/[id]/account`, `/account/status`, `/account/reset-password`, `/api/people/[id]/transfer` | CREATE/UPDATE/DELETE | `users.manage` | theo `perm` | `can("users.manage")` | `perm` | ✔ |

### H. Cấu hình / Quản trị hệ thống / Nhật ký hệ thống

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/admin/system` | `GET/POST /api/admin/system/config`, `/admin/system/overview` | READ/UPDATE | `system.config` | toàn hệ thống | `can("system.config")` | `perm` + role | ✔ (UNIT_LEADER bị chặn `system.config` trừ khi được cấp) |
| `/admin/audit` | `GET /api/admin/audit` | READ | `audit.view` | toàn hệ thống | `can("audit.view")` | `perm` | ✔ |
| `/admin/feedback` | `GET/PATCH /api/feedback` | READ/UPDATE | `perm` | toàn hệ thống | `can(...)` | `perm` | ✔ |

### I. Thông báo / Trao đổi / Tệp đính kèm

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/notifications` | `GET/PATCH/DELETE /api/notifications/**` | READ/UPDATE/DELETE | chính người nhận | `recipientId = user.personId` | – | lọc theo người nhận | ✔ an toàn |
| `/tasks/[id]` trao đổi | `GET/POST/PATCH/DELETE /api/tasks/[id]/comments`, `.../comments/reactions` | CRUD | chủ trì/phối hợp/lãnh đạo | `verifyTaskAccess` | – | `taskScope` | ✔ |
| `/tasks/[id]` tệp | `GET/POST/DELETE /api/tasks/[id]/attachments` | READ/CREATE/DELETE | `verifyTaskAccess` | `taskScope` | – | `taskScope` | ✔ |
| `/work-evidence` (minh chứng) | `GET/POST /api/work-evidence`, `DELETE /api/work-evidence/[id]` | READ/CREATE/DELETE | chủ trì việc / lãnh đạo | `access.scope` (OWNER/LEADER) | – | scope riêng | ✔ (mẫu tốt: `scope` theo quan hệ, không theo vai trò) |

### J. Khác

| Màn hình | API | Thao tác | Ai | Phạm vi | Frontend | Backend | Rủi ro / thiếu |
|---|---|---|---|---|---|---|---|
| `/products` | `GET /api/products` | READ | mọi role ≠ SYSTEM_ADMIN | toàn hệ thống | – | role | ✔ (danh mục chung) |
| `/work-catalog` | `GET /api/work-catalog` | READ | role | theo kích hoạt đơn vị | – | `perm`+`unitScope` | ✔ |
| `/push` | `POST/DELETE /api/push/subscribe` | CREATE/DELETE | chính người | `user.personId` | – | – | ✔ |
| `/roles` | `GET /api/roles` | READ | role ≠ SYSTEM_ADMIN | toàn hệ thống | – | role | ⚠️ **chỉ có API đọc; chưa có UI quản trị vai trò** |
| `/calendar`, `/huong-dan` | – | – | – | – | – | – | – |

**Tổng:** 87 route API · 69 route ghi · 4 route không `authenticateRequest` (`/api/auth/login|logout|change-password|/me` — hợp lý) · **3 route ghi không có `authenticateRequest`** (cần rà: `/api/auth/change-password` là tự xác thực qua token ⇒ chấp nhận được).

---

## 6. NHẬN ĐỊNH 12 CÂU HỎI

| # | Câu hỏi | Trả lời (đã xác minh) |
|---|---|---|
| 1 | Cơ chế xác thực | JWT (`jsonwebtoken`) + cookie/header; middleware kiểm tra token, API nạp lại quyền từ DB mỗi request (`auth.ts:69-155`) |
| 2 | Role lưu ở đâu | `role_grants` (account × role × scope + thời hạn); `roles` là danh mục; `SessionUser.role` = grant đầu tiên |
| 3 | Hardcode ở đâu | **159 dòng / 53 file** (bảng ở mục 3) + `guard.ts:28/36/52` + `usePermissions.ts:83-95` |
| 4 | Bảng RBAC | **Đã có đủ**: `roles`, `permissions`, `role_permissions`, `role_grants` (có `scopeType`, `validFrom/To`) |
| 5 | Phân quyền theo chức vụ/bộ phận/quan hệ phụ trách | Bộ phận: `person_assignments` + `role_grants.scopeUnitId` + `getAuthorizedUnitIds` ✔ · Chức vụ: `Position` chỉ là thông tin, **không** dùng để phân quyền ✘ · Quan hệ phụ trách: `person_supervisions` dùng cho **đánh giá điểm**, **không** dùng cho phân quyền ✘ |
| 6 | Nhiều vai trò | **Có** (`role_grants` nhiều dòng) — quyền được hợp; nhưng `role` chỉ lấy grant[0] ⇒ kiểm tra theo vai trò bị thiên lệch |
| 7 | Phân quyền theo từng nhiệm vụ/kế hoạch/văn bản | **Không có quyền cấp theo đối tượng**; chỉ có **IDOR check theo quan hệ** (`verifyTaskAccess`, `checkWorkItemAccess`, `access.scope`) |
| 8 | Guard API kiểm tra gì | 4 tiêu chí: (1) token+grant DB, (2) `checkPermission` (mã quyền), (3) phạm vi đơn vị (`getAuthorizedUnitIds`/`buildScopedWhereClause`), (4) quan hệ với đối tượng (`verifyTaskAccess`) — **không** kiểm tra trạng thái nghiệp vụ trừ vài route đã ghi nhận luật riêng |
| 9 | Middleware / server / route / frontend có thống nhất không | **Không hoàn toàn**: middleware chỉ check token; `checkPermission` có bypass `UNIT_LEADER`; frontend `canDo` **lặp lại** bypass nhưng với danh sách `SYSTEM_ADMIN_TECH` **khác** backend ⇒ dễ lệch |
| 10 | Vượt quyền qua API dù UI đã ẩn nút | **Có** — ví dụ đã gặp & đã vá: cán bộ phối hợp mở lại nhiệm vụ đã nghiệm thu qua API (YC-38 F1–F5). Ngoài ra: `/metrics/entries`, `/reports/snapshots` không lọc đơn vị |
| 11 | Cơ chế admin bypass | `SYSTEM_ADMIN`: bypass **giới hạn** 6 quyền kỹ thuật + không đọc dữ liệu nghiệp vụ (`guard.ts:36,54`) ✔ an toàn; `UNIT_LEADER`: bypass **rộng** — toàn quyền trừ `system.config` + phạm vi toàn đơn vị (`guard.ts:28-33,52`) ⚠️ không thu hẹp được bằng DB, không có cơ chế "chỉ đúng đơn vị" |
| 12 | Ủy quyền / kiêm nhiệm / bàn giao | **Hạ tầng có sẵn** (`role_grants.validFrom/validTo`, nhiều grant/tài khoản) nhưng **chưa có UI** và **chưa ai dùng** (`validTo` chỉ có 1 grant đã hết hạn) |

---

## 7. ĐIỂM RỦI RO (xếp theo mức)

| # | Rủi ro | Bằng chứng | Mức |
|---|---|---|---|
| R1 | **Bypass UNIT_LEADER quá rộng**: lãnh đạo đơn vị có toàn quyền nghiệp vụ + toàn đơn vị, không thu hẹp bằng DB | `guard.ts:28-33, 52` | 🔴 Cao |
| R2 | **Role đơn lẻ khiến kiểm tra theo vai trò bị lệch** với người nhiều vai trò | `auth.ts:147` (`role_grants[0]`) | 🔴 Cao |
| R3 | Module **không lọc phạm vi đơn vị**: `/metrics/entries` (GET/POST/PATCH/DELETE), `/reports/snapshots` (CRUD), `/org-units/tree` | thiếu `unitScope`/`perm` | 🔴 Cao |
| R4 | **Frontend lặp logic bypass khác backend** ⇒ hiển thị nút không khớp quyền thật | `usePermissions.ts:83-95` vs `guard.ts:25-45` | 🟠 TB |
| R5 | **11 permission cho 7 module**; 25+ module nghiệp vụ không có quyền riêng ⇒ không thể cấp quyền theo vai trò tùy chỉnh | bảng 2.2 | 🟠 TB |
| R6 | **Không có quyền cấp theo đối tượng** (nhiệm vụ/kế hoạch/văn bản) ⇒ chỉ dựa vào IDOR check thủ công | `verifyTaskAccess` | 🟠 TB |
| R7 | `SessionUser` chứa **quyền tại thời điểm token**; đổi quyền có hiệu lực sau tối đa 60s (cache) — chấp nhận được nhưng cần ghi rõ | `auth.ts:153` | 🟢 Thấp |
| R8 | `SYSTEM_ADMIN` **không có** `role_grants` ⇒ không quản lý được bằng UI vai trò | DB | 🟠 TB |
| R9 | `scopeType` `OWN`/`ASSIGNED`/`SUBTREE` **chưa dùng** ⇒ phạm vi hẹp chưa có hiện thực | DB | 🟡 Thấp |
| R10 | `position`/`person_supervisions` không ảnh hưởng phân quyền ⇒ mô hình "chức vụ" chưa dùng được | schema | 🟡 Thấp |
| R11 | `/api/roles` chỉ có GET ⇒ **chưa có** đường quản lý vai trò từ giao diện | `src/app/api/roles` | 🟠 TB |
| R12 | Audit có `IDOR_ATTEMPT_BLOCKED` (chỉ cho SYSTEM_ADMIN) ⇒ chưa có nhật ký hệ thống cho các từ chối quyền khác | `guard.ts:121-127` | 🟡 Thấp |

---

## 8. KẾT LUẬN BƯỚC 01

1. **Hạ tầng RBAC đã có** (roles/permissions/role_permissions/role_grants + scope + thời hạn) ⇒ YC-39 **không cần dựng lại**, cần **chuẩn hóa + nối + chặn**.
2. **Quyền đang quản lý rải rác**: 46 lần `checkPermission` (tập trung) vs **159 dòng hardcode vai trò** (phân tán) ⇒ phân quyền thực tế **không kiểm kê được**.
3. **Tái sử dụng được**: `role_grants` (scope + thời hạn), `checkPermission`, `getAuthorizedUnitIds`, `verifyTaskAccess`, `access.scope` (work-evidence), `assertTaskStatusTransition` (khóa nghiệp vụ), `usePermissions` (cache + `can()`), `recordAuditEvent`.
4. **Module rủi ro cao nhất**: `metrics` (không lọc đơn vị), `reports/snapshots` (CRUD không lọc đơn vị), `personal-work-items` (12 chỗ hardcode role), `monthly-results` (6), `rosters`/`leaves` (không có permission).
5. **Không cần đổi schema** cho bước 1: bảng đã đủ. Cần bổ sung **cột/bảng nhỏ** nếu muốn: audit quyền, quyền theo đối tượng, cờ "vai trò hệ thống không sửa được".
6. **Phương án ít ảnh hưởng Production nhất**: giữ nguyên `role_grants` + `permissions` hiện có; **mở rộng tập permission** + **thay hardcode role bằng `checkPermission`** dần theo module; **bổ sung guard phạm vi đơn vị** cho `metrics`/`reports.snapshots`/`org-units.tree`; giữ nguyên `assertTaskStatusTransition` làm lớp khóa nghiệp vụ ưu tiên cao.
7. **Cần hỏi Hải quan**: phạm vi `UNIT_LEADER` (toàn đơn vị hay đúng đơn vị được giao?), có cho phép cán bộ **tự khai** nhiệm vụ nhận việc thay lãnh đạo?, quy trình **ủy quyền** khi lãnh đạo vắng mặt, ai được **quản trị vai trò**, và có cho phép **bình luận/minh chứng bổ sung** trên nhiệm vụ đã nghiệm thu hay không.
