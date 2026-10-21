# YC-39 · BƯỚC 02 — THUẬT TOÁN QUYỀN HIỆU LỰC

**Ngày:** 21/10/2026 · **Đi kèm:** `YC39_04` (rủi ro & bản vá) · `YC39_02` (ma trận quyền) · `YC39_03` (thiết kế)
**Trạng thái:** ĐỀ XUẤT THUẬT TOÁN — chưa triển khai, chưa đổi hành vi Production.

---

## 1. NGUYÊN TẮC CỐT LÕI

> **Quyền và phạm vi phải được tính từ CÙNG MỘT GRANT HỢP LỆ.**
> Tuyệt đối không "kết hợp chéo" để tạo ra quyền rộng hơn hệ thống hiện tại.

Vì vậy mô hình là **theo grant**, không phải "hợp quyền + hợp phạm vi độc lập".

```
Với mỗi grant g của tài khoản a:
    g hợp lệ  ⟺  (g.validFrom ≤ now)  ∧  (g.validTo = null ∨ g.validTo > now)
                 ∧  role(g).status = 'ACTIVE'          ← ngừng sử dụng vai trò = mất hiệu lực
                 ∧  role(g) không bị xoá

Quyền hiệu lực(a)  =  ⋃ { permission.code | g hợp lệ, permission ∈ role_permissions(g.role) }
Phạm vi hiệu lực(a) =  ⋃ { scope(g) | g hợp lệ }        ← mỗi scope đi kèm đúng grant của nó

Khi quyền được kiểm tra cho một đối tượng cụ thể O:
    1) tìm các grant g của a mà g hợp lệ
       VÀ g.scope bao phủ O (đơn vị của O, hoặc O là của a, hoặc O được gán cho a)
    2) quyền cho phép hành động X trên O = ⋃ { quyền của g | g bao phủ O }
    3) sau đó mới áp Business Policy (khóa) — luôn ưu tiên cao hơn
```

**Vì sao không hợp chéo:** nếu hợp rời, một người có grant A (quyền `tasks.approve`, phạm vi `OWN`) và grant B
(quyền `tasks.view`, phạm vi `ORGANIZATION`) sẽ nhận được `tasks.approve` **toàn đơn vị** — rộng hơn
cả hai grant gốc. Mô hình hiện tại (`permissions` = hợp, `scopeType` = grant[0]) **đã** có lỗi kiểu này ở mức độ nhỏ
(ví dụ `cb002` có `DEPARTMENT_LEADER` nhưng phạm vi lấy từ grant STAFF).

---

## 2. THUẬT TOÁN (PSEUDO-CODE)

```ts
type Grant = { role: Role; scopeType; scopeUnitId?; validFrom; validTo? };

function isGrantValid(g: Grant, now = new Date()): boolean {
  if (g.role.status !== "ACTIVE") return false;              // vai trò đã ngừng sử dụng
  if (g.validFrom > now) return false;
  if (g.validTo && g.validTo <= now) return false;            // đã hết hạn
  return true;
}

// Quyền theo từng grant (không hợp chéo)
function grantsFor(accountId: string, now = new Date()): Grant[] {
  return account.roleGrants.filter(g => isGrantValid(g, now));
}

// Quyền cho một đối tượng cụ thể
function canOn(user, permission: string, object: { unitId?, ownerPersonId?, assigneeIds? }): boolean {
  // 1) Quyền hệ thống đặc biệt (chỉ SYSTEM_ADMIN) — không gắn grant
  if (isSystemAdmin(user)) return SYSTEM_ADMIN_PERMISSIONS.includes(permission);

  // 2) Duyệt TỪNG grant: quyền VÀ phạm vi phải cùng grant
  for (const g of grantsFor(user.accountId)) {
    if (!g.permissions.includes(permission)) continue;        // grant này không có quyền
    if (!scopeCovers(g, object)) continue;                    // phạm vi grant này không phủ đối tượng
    return true;                                             // ✔ có quyền VÀ đúng phạm vi
  }
  return false;
}

function scopeCovers(g, object): boolean {
  switch (g.scopeType) {
    case "OWN":        return object.ownerPersonId === g.personId;
    case "ASSIGNED":   return object.ownerPersonId === g.personId
                            || object.assigneeIds?.includes(g.personId);
    case "DEPARTMENT": return object.unitId === g.scopeUnitId;
    case "SUBTREE":    return isInSubtree(object.unitId, g.scopeUnitId);
    case "ORGANIZATION": return true;                         // toàn tổ chức
  }
}

// Business policy: KHÓA luôn thắng quyền cho phép
function finalGate(user, action, object): { allowed, reason } {
  if (isTaskTerminal(object.status)) return { allowed:false, reason:"nhiệm vụ đã nghiệm thu/kết thúc" };
  if (action === "approve" && object.ownerPersonId === user.personId) return { allowed:false, reason:"không tự phê duyệt" };
  ...
}
```

**Điểm tái sử dụng:** `isGrantValid` dùng được ngay với dữ liệu hiện tại (`role_grants.validFrom/validTo` đã có).
`scopeCovers` mở rộng `getAuthorizedUnitIds` (`guard.ts:47-81`) bằng 2 nhánh `OWN`/`ASSIGNED` đang bỏ trống.

---

## 3. MƯỜI TÌNH HUỐNG THỰC TẾ

| # | Tình huống | Kết quả thuật toán | Cơ sở |
|---|---|---|---|
| 1 | **Tài khoản nhiều Role** — `cb002` có `STAFF`(DEPARTMENT, BP_GIAMSAT_B) + `DEPARTMENT_LEADER`(DEPARTMENT, BP_GIAMSAT_B) | Quyền = hợp **trong từng grant**; phạm vi = hợp đơn vị của các grant hợp lệ (cùng bộ phận) ⇒ `tasks.approve` (nếu `DEPARTMENT_LEADER` có) **chỉ** trong BP_GIAMSAT_B. `role` chính = **vai trò mạnh nhất theo thứ tự ưu tiên do Hải quan chốt** (không còn "grant[0]" ngẫu nhiên) | `role_grants` không `orderBy` ⇒ phải sửa (P4/P6) |
| 2 | **Mỗi Role nhiều Permission** | Quyền của role = `role_permissions`; mỗi grant mang đúng tập quyền của **role của grant đó** | `role_permissions` (31 dòng) |
| 3 | **Mỗi grant có Scope + thời hạn riêng** | Quyền chỉ hiệu lực **trong** grant còn hạn **và** trong phạm vi của grant đó | `role_grants.scope_*`, `valid_*` |
| 4 | **Vai trò hết hạn** (grant `validTo` ≤ now) | Grant bị loại khỏi tập hợp ⇒ **mất quyền và mất phạm vi** của grant đó. Hiện có 1 grant như vậy (`cb002`/STAFF, hết hạn 16/10) ⇒ `cb002` **hiện chỉ** còn quyền `DEPARTMENT_LEADER` | `isGrantValid` |
| 5 | **Kiêm nhiệm hai bộ phận** (2 grant `DEPARTMENT`, 2 `scopeUnitId`) | Quyền tính ở **cả hai** bộ phận, **nhưng** mỗi quyền chỉ áp dụng trong phạm vi bộ phận tương ứng ⇒ người kiêm nhiệm **không** được dùng quyền của bộ phận A để xử lý dữ liệu của bộ phận B | `scopeCovers` |
| 6 | **Cán bộ phối hợp liên bộ phận** (task thuộc đơn vị B, a được gán vào `task_assignees`) | Với scope `ASSIGNED`: được thấy/được ghi phần việc **của task đó** (quan hệ gán), **không** được xem toàn bộ đơn vị B | `scopeCovers` + `verifyTaskAccess` |
| 7 | **Lãnh đạo giao việc cho người thuộc bộ phận khác** | `UNIT_LEADER` (scope `ORGANIZATION`): được giao ⇒ thấy & duyệt được task đó (quan hệ gán), **kể cả** ngoài đơn vị — đúng thực tế "lãnh đạo giao việc liên bộ phận" | `scope=ORGANIZATION` + `verifyTaskAccess` |
| 8 | **Cán bộ là chủ trì một nhiệm vụ và là lãnh đạo ở nhiệm vụ khác** | Chủ trì: quyền `tasks.update_own` trong phạm vi `OWN`/`ASSIGNED`; lãnh đạo: quyền `tasks.approve` trong phạm vi `DEPARTMENT` — **tách bạch theo grant**, không cộng dồn | `canOn` theo grant |
| 9 | **Chống tự phê duyệt** | Business policy: `action==='approve' && object.ownerPersonId === user.personId` ⇒ **chặn** (bất kể grant nào) | `finalGate` — lớp khóa, ưu tiên cao hơn quyền |
| 10 | **Khóa nghiệp vụ COMPLETED/DONE/CANCELED** | `finalGate`: mọi hành động ghi trên nhiệm vụ kết thúc ⇒ **409** (đã triển khai ở F1–F5, giữ nguyên) | `assertTaskNotTerminal` |

---

## 4. KIỂM SOÁT Ở BACKEND & TÁI SỬ DỤNG

| Lớp | Hàm hiện có | Tái dùng / mở rộng |
|---|---|---|
| Xác thực | `authenticateRequest` (`auth.ts:69`) | Giữ nguyên; **bổ sung** `roles[]`, `grants[]` (đã lọc hạn) vào `SessionUser` |
| Quyền | `checkPermission` (`guard.ts:25`) | Giữ hành vi hiện tại ở G0–G2; G3+ dùng `canOn(user, permission, object)` |
| Phạm vi | `getAuthorizedUnitIds` (`guard.ts:47`) | Giữ; bổ sung nhánh `OWN`/`ASSIGNED`; `SUBTREE` đã có |
| IDOR theo đối tượng | `verifyTaskAccess` (`guard.ts:97`), `checkWorkItemAccess`, `access.scope` | Giữ — đây là lớp **quan hệ**, bổ sung cho lớp quyền |
| Khóa nghiệp vụ | `assertTaskStatusTransition`, `assertTaskNotTerminal` | Giữ nguyên; **luôn** chạy sau bước quyền |
| Ghi log | `recordAuditEvent` | Thêm hành động `ROLE_GRANT_*`, `PERMISSION_DENIED` (chỉ ghi khi bị từ chối có dấu hiệu bất thường, tránh log flood) |

**Thứ tự kiểm tra bắt buộc trong mọi route ghi:**
```
1. authenticateRequest            (token + grant hợp lệ)
2. canOn(permission, object)       (quyền + phạm vi theo CÙNG grant)
3. assertTaskStatusTransition / assertTaskNotTerminal   (khóa nghiệp vụ)
4. kiểm tra quan hệ (verifyTaskAccess / access.scope)  (nếu có đối tượng)
5. ghi dữ liệu + audit
```
> Bước 3 **luôn** sau bước 2 và **không** bị bỏ qua bởi bất kỳ quyền nào.

---

## 5. KHẢ NĂNG TÁI SỬ DỤNG THÀNH PHẦN HIỆN CÓ

| Thành phần | Mức tái sử dụng | Ghi chú |
|---|---|---|
| `role_grants` (scope + thời hạn) | **100%** | Không cần migration; chỉ thêm `roles.status` (ngừng dùng) |
| `role_permissions`, `permissions` | **100%** | Thêm mã mới, không sửa mã cũ |
| `checkPermission` | **80%** | Bổ sung nhánh theo `roles[]`; giữ bypass để đảm bảo không mất quyền khi chuyển đổi |
| `getAuthorizedUnitIds` | **90%** | Thêm `OWN`/`ASSIGNED`; `SUBTREE` đã có |
| `verifyTaskAccess` | **100%** | Giữ nguyên — lớp IDOR tốt nhất hiện có |
| `assertTaskStatusTransition` / F1–F5 | **100%** | Lớp khóa nghiệp vụ, độc lập RBAC |
| `usePermissions().can()` | **70%** | Phải đồng bộ nguồn quyền với BE (M6) |
| `recordAuditEvent` | **100%** | Dùng cho `role_audits` |

---

## 6. HIỆU LỰC VỚI PHIÊN ĐANG MỞ

| Tình huống | Hành vi | Thời gian có hiệu lực |
|---|---|---|
| Thêm quyền cho vai trò | `authenticateRequest` nạp lại DB mỗi request | **Ngay** (tối đa 60s do cache `authMemoryCache`) |
| Thu hồi grant | Như trên | **Tối đa 60s** — JWT vẫn hợp lệ nhưng quyền được tính lại từ DB |
| Ngừng sử dụng vai trò (`roles.status='DISABLED'`) | Grant của role ⇒ không hợp lệ | Tối đa 60s |
| Gán/thu hồi qua UI | Gọi `refreshPermissions()` ở FE sau khi đổi | Ngay ở phiên đang mở |
| **Yêu cầu bắt buộc** (khuyến nghị) | Với thay đổi **thu hồi** quyền nhạy cảm (`tasks.approve`, `roles.manage`): vô hiệu cache phiên của account đó + ghi audit | Ngay |

**Không** cần buộc đăng xuất toàn hệ thống (rủi ro vận hành cao, không cần thiết vì quyền luôn được tính lại từ DB).
