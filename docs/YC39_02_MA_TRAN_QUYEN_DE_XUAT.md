# YC-39 · BƯỚC 01 — MA TRẬN QUYỀN ĐỀ XUẤT (CHƯA TRIỂN KHAI)

**Ngày:** 21/10/2026 · **Đi kèm:** `YC39_01_AUDIT_PHAN_QUYEN_HIEN_TAI.md` · `YC39_03_THIET_KE_MODULE_RBAC.md`
**Trạng thái:** **ĐỀ XUẤT — chưa triển khai, chưa áp dụng Production.**
Phân biệt rõ: **cột "Hiện hành"** = hệ thống đang chạy (đã kiểm chứng) · **cột "Đề xuất"** = thiết kế YC-39 (chờ duyệt).

---

## 1. DANH MỤC ROLE

### 1.1. Vai trò hệ thống (giữ nguyên, `isSystem=true` — không cho sửa/xoá)

| Mã | Tên | Hiện hành | Đề xuất |
|---|---|---|---|
| `STAFF` | Công chức | 3 quyền · 19 grant | Giữ; **mở rộng** quyền theo bảng 2 |
| `DEPARTMENT_LEADER` | Trưởng bộ phận | 7 quyền · 3 grant | Giữ; thêm `*.approve` của bộ phận |
| `UNIT_LEADER` | Trưởng hải quan cửa khẩu | 11 quyền · 3 grant | Giữ **mã**; **bỏ bypass toàn quyền** (R1) → quyền do DB quyết định, mặc định cấp đầy đủ như cũ để không giảm quyền |
| `SYSTEM_ADMIN` | Quản trị hệ thống | 10 quyền (không có grant) | Giữ bypass **giới hạn**; thêm grant quản trị để vào được UI vai trò |
| *(mới)* `DEPUTY_UNIT_LEADER` | Phó/bí thư lãnh đạo (ủy quyền) | — | Vai trò **không hệ thống**, dùng cho ủy quyền có thời hạn |

### 1.2. Vai trò tùy chỉnh (do quản trị tạo — `isSystem=false`)

| Mã ví dụ | Mô tả | Quyền gốc |
|---|---|---|
| `TRUONG_NHOM` | Trưởng nhóm (bộ phận) | `tasks.assign` + `tasks.update_own` + `plans.create` + `reports.view` (phạm vi `DEPARTMENT`) |
| `CHUYEN_VIEN` | Chuyên viên tổng hợp | `reports.view` + `reports.export` (phạm vi `DEPARTMENT`) |
| `KE_TOAN` | Kế toán — xem kết quả, xuất báo cáo | `reports.view` + `reports.export` + `monthly_results.view` (phạm vi `DEPARTMENT`) |
| `THU_KY_HOI_NGHI` | Thư ký hội nghị / giao ban | `meetings.manage` + `docs.manage` (phạm vi `DEPARTMENT`) |
| `GIAM_SAT_TRUONG` | Giám sát trưởng | `reports.view` + `evaluations.view` (phạm vi `SUBTREE`) |
| *(tự tạo)* | — | Người dùng chọn từ thư viện quyền |

**Ràng buộc bắt buộc**
- Không cho tạo/sửa/xoá vai trò có `isSystem=true`.
- Không cho tạo vai trò có quyền vượt quyền của người đang quản trị.
- Không cho gán `SYSTEM_ADMIN` cho tài khoản nếu người quản trị không tự có quyền đó.

---

## 2. DANH MỤC PERMISSION ĐỀ XUẤT

**Quy ước mã:** `<module>.<action>` — `module` = tên nghiệp vụ (tiếng Việt không dấu, snake_case hoặc kebab), `action` = động từ ngắn.
Tất cả mã **mới** đều chưa tồn tại trong DB (11 mã hiện hành giữ nguyên, không đổi).

| Module | Mã quyền | Mô tả | Hiện hành |
|---|---|---|---|
| **TASKS** | `tasks.view` | Xem nhiệm vụ trong phạm vi được phân công/đơn vị | *(chưa có — dùng IDOR check)* |
| | `tasks.create` | Tạo nhiệm vụ (tự khởi tạo) | *(chưa có)* |
| | `tasks.assign` | Giao/chỉ định người phụ trách | ✔ có |
| | `tasks.update_own` | Cập nhật tiến độ việc của mình | ✔ có |
| | `tasks.update_any` | Cập nhật việc của người khác trong đơn vị | *(chưa có)* |
| | `tasks.submit` | Nộp kết quả chờ duyệt | *(chưa có)* |
| | `tasks.approve` | Nghiệm thu / trả lại kết quả | *(chưa có — đang dùng `isTaskLeader`)* |
| | `tasks.extend` | Duyệt gia hạn | *(chưa có)* |
| | `tasks.delete` | Xoá nhiệm vụ trùng | *(chưa có)* |
| | `tasks.comment` | Bình luận/trao đổi trên nhiệm vụ | *(chưa có)* |
| | `tasks.attachment` | Đính kèm tài liệu | *(chưa có)* |
| **PLANS** | `plans.view` | Xem kế hoạch | ✔ có |
| | `plans.create` | Lập kế hoạch | ✔ có (chưa dùng đúng chỗ) |
| | `plans.approve` | Phê duyệt kế hoạch | ✔ có |
| | `plans.edit` | Sửa kế hoạch đã lập | *(chưa có)* |
| **WORKITEM** | `workitem.view` | Xem đầu việc cá nhân | *(chưa có)* |
| | `workitem.create` | Tạo đầu việc | *(chưa có)* |
| | `workitem.update_own` | Sửa đầu việc của mình | *(chưa có)* |
| | `workitem.update_any` | Sửa đầu việc người khác trong đơn vị | *(chưa có)* |
| | `workitem.delete` | Xoá đầu việc | *(chưa có)* |
| **APPROVALS** | `approvals.view` | Xem trung tâm phê duyệt | *(chưa có)* |
| | `approvals.decide` | Quyết định hồ sơ (duyệt/từ chối/giải trình) | *(chưa có)* |
| | `approvals.respond` | Trả lời yêu cầu giải trình | *(chưa có)* |
| **MONTHLY** | `monthly_results.view` | Xem kết quả công tác tháng | *(chưa có)* |
| | `monthly_results.create` | Ghi kết quả tháng | *(chưa có)* |
| | `monthly_results.lock` | Chốt kết quả tháng | *(chưa có)* |
| **EVALUATIONS** | `evaluations.view` | Xem đánh giá/xếp loại | *(chưa có)* |
| | `evaluations.score` | Chấm điểm, đề xuất xếp loại | *(chưa có)* |
| | `evaluations.approve` | Phê duyệt xếp loại | *(chưa có)* |
| | `evaluations.export` | Xuất biểu 01A/01B/02A/02B | *(chưa có)* |
| **REPORTS** | `reports.view` | Xem báo cáo tổng hợp | ✔ có |
| | `reports.export` | Xuất báo cáo | ✔ có |
| | `reports.snapshot` | Tạo/xoá bản chốt số liệu | *(chưa có)* |
| **ROUTINE** | `routine.view` · `routine.create` · `routine.approve` | Nhật ký tác nghiệp | *(chưa có)* |
| **ROSTERS** | `rosters.view` · `rosters.manage` · `rosters.export` | Lịch trực, lịch công tác | *(chưa có)* |
| **LEAVES** | `leaves.view` · `leaves.create` · `leaves.approve` | Nghỉ phép / công tác | *(chưa có)* |
| **DOCS** | `docs.view` · `docs.create` · `docs.manage` | Sổ văn bản | *(chưa có)* |
| **MEETINGS** | `meetings.view` · `meetings.manage` | Giao ban, biên bản | *(chưa có)* |
| **GIABAN** | `giao_ban.view` · `giao_ban.import` · `giao_ban.config` | Báo cáo giao ban | *(chưa có)* |
| **METRICS** | `metrics.view` · `metrics.enter` · `metrics.confirm` · `metrics.admin` | Chỉ tiêu số liệu | *(chưa có)* |
| **EVIDENCE** | `evidence.view` · `evidence.create` · `evidence.delete` | Minh chứng | *(chưa có)* |
| **SUPERVISIONS** | `supervisions.view` · `supervisions.manage` | Quan hệ phụ trách | *(chưa có)* |
| **PEOPLE** | `people.view` · `people.manage` · `people.account` · `users.manage` | Nhân sự & tài khoản | `org.manage`, `users.manage` (tên cũ) |
| **ORG** | `org.view` · `org.manage` | Tổ chức, đơn vị, chức vụ | ✔ `org.manage` |
| **CATALOG** | `catalog.view` · `catalog.manage` | Danh mục TX, sản phẩm QĐ1277, biểu mẫu | ✔ `catalog.manage` |
| **SYSTEM** | `system.config` · `audit.view` · `form.manage` | Cấu hình, nhật ký hệ thống, biểu mẫu | ✔ có |
| **ROLES (mới)** | `roles.view` · `roles.manage` · `roles.assign` | Quản lý vai trò & gán vai trò | *(chưa có)* |
| **NOTIFICATIONS** | `notifications.view_own` | Thông báo của mình | *(mặc định theo người nhận)* |

**Tổng đề xuất:** ~68 mã (11 hiện hành giữ nguyên + ~57 mới) trên 22 module.

---

## 3. CẤP PHẠM VI (SCOPE) THỰC TẾ CẦN HỖ TRỢ

| `scopeType` | Ý nghĩa | Tính hiệu lực | Dùng trong |
|---|---|---|---|
| `OWN` | Chỉ dữ liệu của chính mình (việc được giao, đầu việc, kết quả tháng) | Theo `personId` | **Chưa dùng** → đề xuất bật |
| `ASSIGNED` | Việc được phân công cho mình (kể cả phối hợp) | Theo `tasks.ownerId`/`assignees` | **Chưa dùng** → đề xuất bật |
| `DEPARTMENT` | Toàn bộ bộ phận (đơn vị trực tiếp) | `getAuthorizedUnitIds` | ✔ đang dùng (22 grant) |
| `SUBTREE` | Bộ phận + các đơn vị con | Cây `org_units` | **Chưa dùng** → đề xuất bật (cho giám sát trưởng) |
| `ORGANIZATION` | Toàn đơn vị | `getAuthorizedUnitIds` → `"ALL"` | ✔ đang dùng (3 grant) |
| *(mới)* `CUSTOM` | Danh sách đơn vị tùy chỉnh | `scopeUnitId` + bảng nối | Đề xuất (giai đoạn 2) |

**Quy tắc giao quyền theo vai trò + phạm vi:** một người có nhiều grant ⇒ **hợp quyền** (đã có), **hợp phạm vi** (đề xuất bổ sung: tập hợp đơn vị của mọi grant hợp lệ).

---

## 4. MA TRẬN ROLE × PERMISSION × SCOPE (đề xuất)

`✔` = cấp mặc định · `◐` = cấp theo phạm vi · `—` = không cấp · **(mới)** = mã chưa tồn tại

| Nhóm quyền | STAFF | DEPARTMENT_LEADER | UNIT_LEADER | SYSTEM_ADMIN | Trưởng nhóm (tùy chỉnh) | Chuyên viên (tùy chỉnh) |
|---|---|---|---|---|---|---|
| tasks.view / update_own / submit / comment / attachment | ✔ | ✔ | ✔ | — | ✔ | — |
| tasks.create | ✔ | ✔ | ✔ | — | ✔ | — |
| tasks.assign / update_any / approve / extend / delete | — | ◐ | ✔ | — | ◐ | — |
| plans.view / create | ✔ | ✔ | ✔ | — | ✔ | — |
| plans.approve / edit | — | ◐ | ✔ | — | — | — |
| workitem.* (view/create/update_own) | ✔ | ✔ | ✔ | — | ✔ | — |
| workitem.update_any / delete | — | ◐ | ✔ | — | — | — |
| approvals.view | ◐ | ✔ | ✔ | — | — | — |
| approvals.decide | — | ◐ | ✔ | — | — | — |
| approvals.respond | ✔ | ✔ | ✔ | — | — | — |
| monthly_results.view / create | ◐ | ✔ | ✔ | — | ✔ | ◐ |
| monthly_results.lock | — | — | ✔ | — | — | — |
| evaluations.view | ◐ | ✔ | ✔ | — | — | ◐ |
| evaluations.score / approve | — | ◐ | ✔ | — | — | — |
| evaluations.export | — | ◐ | ✔ | — | — | ✔ |
| reports.view / export | ✔ | ✔ | ✔ | — | — | ✔ |
| reports.snapshot | — | — | ✔ | — | — | — |
| routine.view / create | ✔ | ✔ | ✔ | — | ✔ | — |
| routine.approve | — | ✔ | ✔ | — | — | — |
| rosters.view | ✔ | ✔ | ✔ | — | ✔ | — |
| rosters.manage / export | — | ◐ | ✔ | — | — | — |
| leaves.view / create | ✔ | ✔ | ✔ | — | ✔ | — |
| leaves.approve | — | ✔ | ✔ | — | — | — |
| docs.view / create | ✔ | ✔ | ✔ | — | ✔ | — |
| docs.manage | — | ✔ | ✔ | — | — | — |
| meetings.view / manage | ✔ | ✔ | ✔ | — | ✔ | — |
| giao_ban.view / import / config | ◐ | ✔ | ✔ | — | — | — |
| metrics.view / enter | ◐ | ✔ | ✔ | — | — | — |
| metrics.confirm / admin | — | — | ✔ | — | — | — |
| evidence.view / create | ◐ | ✔ | ✔ | — | ✔ | — |
| evidence.delete | ◐ | ✔ | ✔ | — | — | — |
| supervisions.view / manage | — | ✔ | ✔ | — | — | — |
| people.view | — | ◐ | ✔ | — | — | — |
| people.manage / org.manage | — | — | ✔ | — | — | — |
| people.account / users.manage | — | — | — | ✔ | — | — |
| catalog.view | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| catalog.manage / form.manage | — | — | — | ✔ | — | — |
| system.config / audit.view | — | — | ◐(audit) | ✔ | — | — |
| **roles.view / roles.manage / roles.assign** | — | — | ◐(view) | ✔ | — | — |

**Ngoại lệ bắt buộc (ưu tiên trên mọi quyền cho phép)**
1. Nhiệm vụ `COMPLETED/DONE/CANCELED` ⇒ **cấm** cập nhật/nộp/ghi đè kết quả (đã có ở F1–F5).
2. Chỉ **lãnh đạo** được nghiệm thu `COMPLETED`; **không** tự duyệt việc của chính mình.
3. `SYSTEM_ADMIN` **không** đọc/sửa dữ liệu nghiệp vụ (giữ nguyên).
4. Người **tạo vai trò** không được cấp quyền vượt quyền của chính mình ⇒ **chống tự nâng quyền**.
5. Không được xoá/thay đổi vai trò hệ thống; không được gỡ quyền cuối cùng của chính mình.
6. Kết quả nghiệm thu đã ký **không** được sửa/xoá bởi bất kỳ vai trò nào (ngoại lệ mở lại = quy trình riêng, chưa xây).

---

## 5. CƠ CHẾ TÍNH QUYỀN HIỆU LỰC (ĐỀ XUẤT)

```
effectivePermissions(user) =
      ∪ { rp.permission.code | grant ∈ role_grants(user) còn hiệu lực
                          , role ∈ roles, rp ∈ role_permissions(role) }
      ∪ hardcodedSystemPermissions(role)      ← chỉ SYSTEM_ADMIN (6 quyền kỹ thuật)
      − businessPolicyBlocks(user, action, object)   ← lớp khóa nghiệp vụ (ưu tiên cao)

effectiveScope(user) =
      ∪ scopeUnits(grant) cho mọi grant còn hiệu lực
      (OWN/ASSIGNED được xử lý riêng theo đối tượng, không gộp vào unit)
```

- `role` đơn lẻ (hiện tại) ⇒ **thay bằng** `roles[]` (mảng) trong `SessionUser`; các kiểm tra theo vai trò cũ chuyển sang `checkPermission` (hoặc `hasRole` cho trường hợp đặc biệt).
- Thứ tự ưu tiên: **Business policy (khóa) > Role/DB (cho phép) > mặc định phạm vi**.

---

## 6. CƠ CHẾ ỦY QUYỀN & HẾT HẠN

| Khía cạnh | Cơ chế hiện có (đủ dùng) | Bổ sung đề xuất |
|---|---|---|
| Ủy quyền theo thời gian | `role_grants.validFrom/validTo` | UI chọn ngày hết hạn; tự thu hồi khi hết hạn |
| Ủy quyền nhiều vai trò | nhiều `role_grants`/tài khoản | UI gán nhiều vai trò + nhiều phạm vi |
| Người nhận ủy quyền | `role_grants.accountId` | Hiển thị "đang được ủy quyền cho …" |
| Hiệu lực khi đổi quyền | `authenticateRequest` nạp lại DB mỗi request (cache 60s) | Ghi rõ độ trễ ≤60s; hoặc vô hiệu cache theo phiên khi có thay đổi |
| Nhật ký | `audit_events` (đã có) | Ghi riêng `ROLE_GRANT_CREATE/UPDATE/REVOKE` với `before/after` |

---

## 7. BẢO VỆ VAI TRÒ QUẢN TRỊ CAO NHẤT (CHỐNG TỰ NÂNG QUYỀN)

1. Vai trò `isSystem=true` **không sửa được** mã/nghĩa; chỉ bật/tắt được quyền theo quyết định của Hải quan.
2. Người quản trị vai trò **không được cấp quyền mà mình không có** (so sánh tập quyền hiệu lực).
3. Không cho tự gán/gỡ `roles.manage` cho chính mình; không cho gỡ quyền cuối cùng của mình.
4. `SYSTEM_ADMIN` không phải người dùng nghiệp vụ ⇒ không xem được dữ liệu nghiệp vụ dù có quyền kỹ thuật.
5. Mọi thao tác trên vai trò/grant ghi `audit_events` kèm `before/after`, người thực hiện, thời điểm, lý do.

---

## 8. TƯƠNG THÍCH NGƯỢC (KHÔNG MỞ RỘNG QUYỀN)

| Bước | Cách làm | Bảo đảm |
|---|---|---|
| 1 | **Giữ nguyên** 4 vai trò hệ thống + 11 mã quyền hiện hành + 25 grant | Không mất quyền nào |
| 2 | Thêm các mã quyền **mới** và gán vào vai trò tương ứng **đúng bằng hành vi hardcode hiện tại** (ví dụ `tasks.approve` cho `UNIT_LEADER`/`DEPARTMENT_LEADER` có đơn vị) | Hành vi không đổi |
| 3 | Chuyển dần từng route từ so sánh `role` sang `checkPermission`; **bật cờ theo từng module** để so sánh hành vi | Rollback từng module |
| 4 | Bỏ bypass toàn quyền của `UNIT_LEADER` **sau khi** đã cấp đủ quyền qua DB; giữ `system.config` là ngoại lệ duy nhất | Không giảm quyền |
| 5 | Bổ sung guard phạm vi đơn vị cho `metrics`, `reports/snapshots`, `org-units/tree` | Đóng lỗ hổng đã phát hiện |
| 6 | `SessionUser.role` (string) → `roles[]` (mảng), giữ `role` cũ để tương thích | Không phá code đang chạy |
| 7 | Nếu cần quyền theo đối tượng: bảng mới `object_grants` (chưa đề xuất ở bước 1) | Có thể bổ sung sau |

**Nguyên tắc:** mọi thay đổi phải **giữ nguyên hành vi quan sát được** của người dùng hiện tại; chỉ *siết* những chỗ đã xác minh là lỗ hổng (có bằng chứng) và **không** mở rộng quyền cho bất kỳ ai.

---

## 9. CÂU HỎI CẦN HẢI QUAN XÁC NHẬN (chặn thiết kế)

| # | Câu hỏi | Ảnh hưởng thiết kế |
|---|---|---|
| Q-RB1 | `UNIT_LEADER` giữ quyền **toàn đơn vị** hay giới hạn **đúng đơn vị được giao**? | Quyết định có bỏ bypass toàn quyền hay không |
| Q-RB2 | Cán bộ có được **tự giao việc cho nhau** không, hay chỉ lãnh đạo giao? | Có cấp `tasks.assign` cho `STAFF` không |
| Q-RB3 | Ai được **quản trị vai trò**? (quản trị hệ thống kỹ thuật / lãnh đạo đơn vị / cả hai) | Phạm vi trang quản trị |
| Q-RB4 | Có cho phép **ủy quyền** khi lãnh đạo vắng mặt? Thời hạn tối đa? | Luật `validFrom/validTo` + UI |
| Q-RB5 | Cán bộ **tự ghi nhận** việc theo chỉ đạo ngoài hệ thống được phép không? (đã nghiệm thu câu 3 YC-38) | `tasks.create` + nhãn nguồn |
| Q-RB6 | Có cho phép **bình luận/minh chứng bổ sung** trên nhiệm vụ đã nghiệm thu không? | Mở lại 2 endpoint đang chặn (fail-closed) |
| Q-RB7 | `SYSTEM_ADMIN` có được xem **dữ liệu nghiệp vụ** để hỗ trợ không? | Giữ hay nới bypass |
| Q-RB8 | Ai giữ quyền **duyệt kết quả đánh giá/xếp loại** cấp đơn vị? | `evaluations.approve` + scope |
