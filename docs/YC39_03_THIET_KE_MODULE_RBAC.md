# YC-39 · BƯỚC 01 — THIẾT KẾ MODULE QUẢN LÝ VAI TRÒ & PHÂN QUYỀN (RBAC)

**Ngày:** 21/10/2026 · **Trạng thái:** THIẾT KẾ SƠ BỘ — **chưa triển khai, chưa migration, chưa deploy.**
**Đi kèm:** `YC39_01_AUDIT_PHAN_QUYEN_HIEN_TAI.md` (audit) · `YC39_02_MA_TRAN_QUYEN_DE_XUAT.md` (ma trận quyền)

---

## 1. MỤC TIÊU & NGUYÊN TẮC

Cho phép quản trị viên quản lý trực tiếp trên giao diện: vai trò → quyền → phạm vi → gán cho người, có nhật ký,
có thời hạn, **nhưng không vượt qua khóa nghiệp vụ** (không tự nghiệm thu, không sửa nhiệm vụ đã nghiệm thu).

1. **Không mở rộng quyền** so với hành vi hiện tại; chỉ *chuyển cách thể hiện* quyền từ hardcode → cấu hình.
2. **Khóa nghiệp vụ luôn ưu tiên cao** hơn quyền cho phép (giữ nguyên F1–F5).
3. **Mọi thay đổi quyền có hiệu lực nhanh** và **đều có nhật ký**.
4. **Lùi được**: mọi bước triển khai đều có cờ bật/tắt theo module và rollback không cần migration phụ.

---

## 2. PHƯƠNG ÁN DỮ LIỆU

### 2.1. Tái sử dụng (không đổi schema ở giai đoạn 1)

| Bảng | Dùng lại như thế nào |
|---|---|
| `roles` | Thêm cột `isSystem` (đã có), `status` (ACTIVE/DISABLED) — *bổ sung 1 cột*; mã `isSystem=true` không sửa được |
| `permissions` | Bổ sung mã quyền mới (~57), giữ nguyên 11 mã hiện hành |
| `role_permissions` | Không đổi |
| `role_grants` | Không đổi (đã có `scopeType`, `scopeUnitId`, `validFrom/validTo`) |
| `accounts`, `person_assignments`, `org_units` | Không đổi |

### 2.2. Bổ sung tối thiểu (giai đoạn 1) — 2 bảng + 2 cột

```prisma
// 1) Nhật ký thay đổi quyền (bắt buộc — yêu cầu bài toán)
model RoleAudit {                       // hoặc dùng AuditEvent mở rộng
  id          String   @id @default(uuid())
  action      String   // GRANT_CREATE | GRANT_UPDATE | GRANT_REVOKE | ROLE_UPDATE | PERMISSION_CHANGE
  accountId   String?  @map("account_id")   // người bị ảnh hưởng
  roleId      String?  @map("role_id")
  oldValue    Json?    @map("old_value")
  newValue    Json?    @map("new_value")
  reason      String?
  actorId     String   @map("actor_id")
  createdAt   DateTime @default(now()) @map("created_at")
  @@map("role_audits")
}

// 2) Bộ chính sách nghiệp vụ (khóa) — để UI hiển thị và backend dùng chung
model BusinessPolicy {
  id          String   @id @default(uuid())
  code        String   @unique          // vd: TASK_LOCKED_AFTER_APPROVAL
  module      String
  description String
  severity    String   @default("BLOCK") // BLOCK | REQUIRE_LEADER | REQUIRE_OWNER
  appliesTo   Json?    @map("applies_to")
  isSystem    Boolean  @default(true) @map("is_system")
  @@map("business_policies")
}
```
Bổ sung 2 cột: `roles.status` (ACTIVE/DISABLED — cho "ngừng sử dụng vai trò"), `accounts.roles_managed_by`? — **không cần**;
"ngừng sử dụng" = đặt `roles.status='DISABLED'` ⇒ mọi grant của role đó **mất hiệu lực** (thêm điều kiện `role.status='ACTIVE'` khi tính quyền).

> **Không cần** bảng `object_grants` ở giai đoạn 1 (quyền theo đối tượng) — hiện đã có `verifyTaskAccess`/`access.scope` làm lớp tương đương.

---

## 3. PHƯƠNG ÁN API

| Method | Endpoint | Mục đích | Quyền yêu cầu |
|---|---|---|---|
| GET | `/api/roles` | Danh sách vai trò + số grant + quyền | `roles.view` |
| GET | `/api/roles/[id]` | Chi tiết 1 vai trò | `roles.view` |
| POST | `/api/roles` | Tạo vai trò (mã, tên, mô tả, tập quyền) | `roles.manage` |
| PATCH | `/api/roles/[id]` | Sửa vai trò (tên, mô tả, bật/tắt, tập quyền) | `roles.manage` |
| POST | `/api/roles/[id]/clone` | Sao chép vai trò (tạo mã mới) | `roles.manage` |
| DELETE | `/api/roles/[id]` | **Chỉ** role `isSystem=false` + không còn grant | `roles.manage` |
| GET | `/api/permissions` | Danh mục quyền theo module | `roles.view` |
| GET | `/api/role-grants?accountId=&roleId=` | Tra cứu grant | `roles.view` |
| POST | `/api/role-grants` | Gán vai trò cho người (kèm scope + thời hạn) | `roles.assign` |
| PATCH | `/api/role-grants/[id]` | Đổi phạm vi/thời hạn | `roles.assign` |
| DELETE | `/api/role-grants/[id]` | Thu hồi quyền | `roles.assign` |
| GET | `/api/accounts/[id]/effective-permissions` | **Quyền hiệu lực** của một cán bộ (gộp + giải thích nguồn) | `roles.view` |
| GET | `/api/role-audits` | Lịch sử cấp/đổi/thu hồi quyền | `roles.view` |
| POST | `/api/role-audits/verify-conflicts` | Kiểm tra xung đột quyền (gợi ý) | `roles.view` |

**Quy tắc bắt buộc ở API**
- Không tạo/sửa/xoá vai trò `isSystem=true` (trừ khi có `roles.manage` + cờ `allowSystemRoleEdit` do Hải quan bật).
- Không cấp quyền vượt quyền hiệu lực của người thực hiện.
- Không cho tự gỡ quyền `roles.manage` cuối cùng của chính mình; không cho tự gán `roles.manage`.
- Mọi thao tác ghi → `role_audits` + `audit_events`.
- Xem quyền hiệu lực phải trả **cả nguồn gốc** (role nào, grant nào, phạm vi nào, hết hạn lúc nào) — phục vụ "xem quyền hiệu lực của người dùng".

---

## 4. THIẾT KẾ MÀN HÌNH (đặc tả, chưa code)

### 4.1. `/admin/roles` — Danh sách vai trò
- Bảng: **Mã** · **Tên** · **Loại** (Hệ thống / Tùy chỉnh) · **Trạng thái** (Đang dùng / Đã ngừng) · **Số quyền** · **Số người được gán** · **Thao tác** (Sửa · Sao chép · Ngừng dùng · Xoá).
- Lọc: theo loại, trạng thái, tìm theo mã/tên. Tìm kiếm tiếng Việt không dấu.
- Nút: **+ Tạo vai trò** (chỉ hiện với `roles.manage`).
- Vai trò hệ thống: nút Sửa chỉ cho phép bật/tắt quyền, **không** cho đổi mã; nút Xoá không hiện.

### 4.2. `/admin/roles/[id]` — Tạo / Sửa / Sao chép vai trò
- Tabs: **Thông tin** (mã*, tên*, mô tả, trạng thái) · **Quyền** (ma trận) · **Người được gán** (danh sách + phạm vi + hết hạn) · **Nhật ký**.
- Mã: gợi ý `ROLE_<MODULE>_<CHUC_NANG>`, kiểm tra trùng, không sửa sau khi dùng.
- Nút **Sao chép**: mở form mới với mã `<mã>_COPY` và tập quyền/grant giống bản gốc (grant **không** tự chuyển sang người mới).

### 4.3. Ma trận quyền theo nhóm module
- Cột = nhóm module (Nhóm việc · Kế hoạch · Phê duyệt · Kết quả & Đánh giá · Báo cáo · Tác nghiệp · Danh mục · Tổ chức · Hệ thống); hàng = quyền.
- Ô: 3 trạng thái **○ không có / ◐ theo phạm vi / ✔ toàn quyền** (áp dụng cho quyền có phạm vi).
- Thanh đếm: "Đã chọn 12/68 quyền".
- Thanh "Chọn theo vai trò mẫu": nút **Nạp từ vai trò hệ thống** (mảnh ma trận tương ứng) — giúp sao chép hành vi cũ an toàn.
- **Khóa nghiệp vụ**: các quyền bị khóa (VD: mọi quyền `tasks.*` trên nhiệm vụ đã nghiệm thu) hiển thị biểu tượng ổ khóa + chú thích, **không cho bật/tắt**.

### 4.4. Chọn phạm vi dữ liệu cho quyền
- Khi chọn ◐: hiện dropdown phạm vi: **Cá nhân** (chỉ của tôi) · **Việc được phân công** · **Bộ phận của tôi** · **Cả đơn vị** · **Cả cây đơn vị** · **Chọn đơn vị cụ thể** (multi-select cây tổ chức).
- Nhắc: phạm vi áp dụng **cho mọi quyền trong nhóm**, có thể tinh chỉnh từng quyền.

### 4.5. `/admin/roles/assign` — Gán vai trò cho người
- Tìm cán bộ (theo mã/tên/đơn vị) → chọn vai trò → chọn phạm vi → **ngày hiệu lực / ngày hết hạn** (bỏ trống = không hạn) → lý do (bắt buộc khi thu hồi).
- Danh sách "Đang được gán": vai trò · phạm vi · hiệu lực · trạng thái (đang hiệu lực / sắp hết hạn / đã hết hạn) · thao tác Sửa/Thu hồi.
- Cảnh báo xung đột: *"Vai trò này cho phép nghiệm thu — người được gán cũng đang là người giao nhiệm vụ ⇒ không được tự duyệt"* (hiển thị cảnh báo, **không** chặn — khóa nghiệp vụ ở backend mới là ràng buộc).

### 4.6. `/admin/roles/effective` — Xem quyền hiệu lực của một cán bộ
- Ô tìm cán bộ → bảng: **quyền** · **được cấp từ vai trò nào** · **phạm vi** · **hiệu lực đến** · **nguồn** (DB / quyền hệ thống / khóa nghiệp vụ).
- Mục "Bị chặn bởi khóa nghiệp vụ" liệt kê các hành động không thể thực hiện dù có quyền (VD: sửa nhiệm vụ đã nghiệm thu).

### 4.7. `/admin/roles/audit` — Lịch sử cấp/đổi/thu hồi quyền
- Bộ lọc: người dùng, vai trò, loại hành động, khoảng thời gian, người thực hiện. Cột: thời điểm · người thực hiện · hành động · đối tượng · thay đổi (trước → sau) · lý do.

### 4.8. `/admin/roles/delegation` — Ủy quyền tạm thời
- Danh sách ủy quyền đang hiệu lực/sắp hết hạn/đã hết hạn; tạo ủy quyền (vai trò, phạm vi, từ–đến, lý do); thu hồi sớm.
- Cảnh báo: ủy quyền **không** vượt được khóa nghiệp vụ (VD: ủy quyền nghiệm thu vẫn không cho tự duyệt việc của mình).

### 4.9. Yêu cầu giao diện chung
- Tiếng Việt, dùng thuật ngữ nghiệp vụ Hải quan; giải thích ngắn cạnh mỗi quyền.
- Mọi màn hình có ô tìm kiếm không dấu, bảng phân trang, xuất CSV (quyền `reports.export` hoặc `roles.view`+xuất).
- Tuân thủ pattern giao diện hiện có (`/admin/system`, `/admin/catalog`): nền `surface-container`, nút `secondary`, thẻ bo góc.
- **Không** đưa màn hình quản trị vai trò vào menu cho người thiếu `roles.view`.

---

## 5. CHIẾN LƯỢC TÍCH HỢP AN TOÀN (không gián đoạn Production)

| Giai đoạn | Nội dung | Cờ | Đảo ngược |
|---|---|---|---|
| **G0** | Bổ sung mã quyền mới vào DB + gán vào vai trò **đúng bằng hành vi hardcode hiện tại** | — | Xoá grant mới (không ảnh hưởng) |
| **G1** | `SessionUser.roles[]` (mảng) **bổ sung**, giữ `role` cũ | `RBAC_ROLES_ARRAY` | Tắt cờ |
| **G2** | `checkPermission` bổ sung: `permission || role có trong roles[]`; **bypass UNIT_LEADER giữ nguyên** | `RBAC_PERMISSION_V2` | Tắt cờ |
| **G3** | Chuyển từng module từ so sánh `role` → `checkPermission`; **so sánh hành vi** (script đối chiếu kết quả API trước/sau cho mọi vai trò mẫu) | `RBAC_MODULE_<X>` | Tắt cờ theo module |
| **G4** | Bổ sung guard phạm vi đơn vị cho `metrics`, `reports/snapshots`, `org-units/tree` (đóng lỗ hổng đã xác minh) | `RBAC_SCOPE_HARDEN` | Tắt cờ |
| **G5** | Bỏ bypass toàn quyền `UNIT_LEADER` (sau khi đã cấp đủ quyền qua DB) | `RBAC_NO_LEADER_BYPASS` | Bật lại cờ |
| **G6** | UI quản trị vai trò (chỉ mở cho `roles.manage`) | `RBAC_ADMIN_UI` | Ẩn menu |
| **G7** | Nhật ký đầy đủ + xem quyền hiệu lực + ủy quyền | `RBAC_AUDIT_UI` | Ẩn menu |

**Quy tắc bắt buộc:** mỗi giai đoạn phải có **script đối chiếu hành vi** (chạy cùng một bộ kịch bản API trước/sau, so kết quả) — chỉ chuyển cờ khi **không** có khác biệt ngoài dự kiến.

---

## 6. KẾ HOẠCH MIGRATION (nếu cần)

- **Không cần** migration dữ liệu lớn. Các thay đổi schema đề xuất đều **additive**:
  `roles.status`, bảng `role_audits`, bảng `business_policies` ⇒ `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`, idempotent, dùng `scripts/apply-yc38c-ddl.ts`-style.
- Không xoá/sửa `roles`, `permissions`, `role_permissions`, `role_grants` hiện có.
- **Rollback**: bỏ cờ + (nếu đã thêm bảng) `DROP TABLE` bảng mới — dữ liệu nghiệp vụ không bị ảnh hưởng.

---

## 7. RỦI RO & BIỆN PHÒNG

| Rủi ro | Biện phòng |
|---|---|
| **Mở rộng quyền khi chuyển đổi** | Script đối chiếu hành vi; cờ theo module; so sánh tập quyền hiệu lực trước/sau cho 4 vai trò mẫu |
| **Mất quyền khi bỏ bypass UNIT_LEADER** | G0 cấp đủ quyền vào DB trước; đối chiếu tập quyền trước/sau; G5 sau khi G0–G4 ổn định |
| **Lỗ hổng IDOR mới** do mở rộng API quản trị | Mọi endpoint RBAC kiểm tra `roles.manage` **và** giới hạn phạm vi đối tượng; test IDOR bắt buộc |
| **Chống tự nâng quyền** | Không cấp quyền vượt quyền của mình; chặn tự gán/gỡ `roles.manage`; audit mọi thay đổi |
| **Vô hiệu hoá quyền giữa phiên** | `authenticateRequest` nạp lại DB mỗi request (cache 60s) ⇒ thay đổi có hiệu lực ≤60s; thêm cơ chế vô hiệu cache theo account khi có thay đổi |
| **Ảnh hưởng điểm đánh giá** | Không đụng `scoring`/`evaluation-export` ở G0–G4; luật nghiệp vụ `assertTaskStatusTransition` giữ nguyên |
| **Ảnh hưởng dữ liệu Production** | Tất cả giai đoạn dùng **cờ**, không sửa dữ liệu; backup + restore-test trước mỗi giai đoạn có migration |

---

## 8. KẾ HOẠCH KIỂM THỬ

| Bộ | Phạm vi | Số kiểm tra |
|---|---|---|
| T-RBAC-01 | Ma trận quyền: 4 vai trò hệ thống ⇒ tập quyền hiệu lực **không đổi** so với trước G2/G5 | ~40 |
| T-RBAC-02 | Người nhiều vai trò (`cb002`): quyền hợp, `roles[]` đủ, phạm vi hợp | ~8 |
| T-RBAC-03 | 4 vai trò × 22 nhóm quyền: đúng 403 khi thiếu quyền, đúng 200 khi đủ | ~90 |
| T-RBAC-04 | Phạm vi: cán bộ đơn vị A **không** đọc/ghi dữ liệu đơn vị B (IDOR) cho `tasks`, `work-items`, `metrics`, `reports/snapshots`, `org-units` | ~25 |
| T-RBAC-05 | Khóa nghiệp vụ: 14 kiểm tra F1–F5 của YC-38 vẫn xanh (không nới) | 15 (đã có) |
| T-RBAC-06 | API RBAC: tạo/sửa/sao chép/ngừng dùng/xoá vai trò; gán/thu hồi grant; xem quyền hiệu lực; lịch sử | ~30 |
| T-RBAC-07 | Chống tự nâng quyền: không cấp được quyền vượt quyền mình; không tự gỡ `roles.manage`; không sửa role hệ thống | ~10 |
| T-RBAC-08 | Hủy quyền có thời hạn: hết hạn ⇒ mất hiệu lực (≤60s) | ~5 |
| T-RBAC-09 | Hồi quy YC-01→38 (bộ hiện có) | không đổi |

---

## 9. LỘ TRÌNH TRIỂN KHAI

| Bước | Nội dung | Ước lượng |
|---|---|---|
| 0 | Duyệt kiến trúc + câu hỏi Q-RB1..Q-RB8 | — |
| 1 | G0: thêm mã quyền + gán theo hành vi hiện tại (chỉ đọc hành vi) | 0,5 ngày |
| 2 | G1–G2: `roles[]` + `checkPermission` v2 (cờ) | 0,5 ngày |
| 3 | G3: chuyển module theo thứ tự rủi ro cao → thấp (`tasks` → `personal-work-items` → `monthly-results` → `rosters`/`leaves` → `metrics` → còn lại) | 3–5 ngày |
| 4 | G4: siết phạm vi `metrics`/`reports.snapshots`/`org-units.tree` | 1 ngày |
| 5 | G5: bỏ bypass UNIT_LEADER | 0,5 ngày |
| 6 | G6–G7: UI quản trị vai trò + nhật ký + ủy quyền | 5–8 ngày |
| 7 | Giai đoạn 2 (nếu Hải quan yêu cầu): quyền theo đối tượng, `scope CUSTOM`, đồng bộ quyền với chức vụ/quan hệ phụ trách | +5 ngày |

**Ưu tiên đề xuất:** làm **G0–G4 trước** (đóng lỗ hổng + nền tảng), **UI quản trị vai trò (G6) làm sau** — vì UI mà không có nền tảng quyền chuẩn hoá sẽ chỉ hình thức.

---

## 10. CẦN HỎI HẢI QUAN TRƯỚC KHI XÂY

1. `UNIT_LEADER` giữ quyền toàn đơn vị hay giới hạn đúng đơn vị? (Q-RB1)
2. Cán bộ có tự giao việc cho nhau được không? (Q-RB2)
3. Ai quản trị vai trò, và có được quản trị **vai trò của chính mình** không? (Q-RB3)
4. Quy trình ủy quyền khi lãnh đạo vắng mặt: thời hạn tối đa, ai duyệt? (Q-RB4)
5. Cán bộ tự ghi nhận việc theo chỉ đạo ngoài hệ thống: được phép không? (Q-RB5)
6. Bình luận/minh chứng bổ sung trên nhiệm vụ đã nghiệm thu: được phép không? (Q-RB6)
7. `SYSTEM_ADMIN` có được xem dữ liệu nghiệp vụ để hỗ trợ không? (Q-RB7)
8. Ai duyệt kết quả đánh giá/xếp loại cấp đơn vị? (Q-RB8)
