# BÁO CÁO KIỂM TOÁN CHỨC NĂNG THỰC TẾ HỆ THỐNG
# (BACKEND REALITY AUDIT REPORT)

**Dự án:** `talung-cus-work` — Hệ thống Quản trị & Điều hành Tác nghiệp Hải quan Cửa khẩu Quốc tế Tà Lùng  
**Thời điểm thực hiện:** 10/10/2026  
**Mục tiêu kiểm toán:** Rà soát tính trung thực toàn bộ mã nguồn, phân loại trạng thái thực tế (REAL / PARTIAL / MOCK / UI ONLY / BROKEN), vạch rõ các điểm giả lập dữ liệu, phân tích lỗ hổng trong các bài kiểm thử tự động, và đề xuất lộ trình hoàn thiện Backend theo lát cắt dọc (Vertical Slice).

---

## TỔNG QUAN KẾT QUẢ KIỂM TOÁN

| Phân loại | Số lượng màn hình / Chức năng chính | Tỷ lệ (%) | Nhận định chung |
| :--- | :---: | :---: | :--- |
| **REAL** (Hoạt động hoàn chỉnh) | 6 / 17 | 35.3% | Đăng nhập/JWT/RBAC, Quản lý nhiệm vụ cơ bản, Lập & Duyệt kế hoạch, Xuất Excel Mẫu A & B, Audit Log. |
| **PARTIAL** (Có Backend nhưng chưa trọn vẹn) | 7 / 17 | 41.2% | Dashboard, Phê duyệt, Nhật ký ca trực, Chốt kỳ số liệu, Quản trị cơ cấu tổ chức, Danh mục 48 việc, Form Builder. |
| **MOCK / MOCK STATE** (Giả lập trạng thái/dữ liệu) | 2 / 17 | 11.8% | Hộp thư thông báo (chưa có bảng CSDL, reset khi F5), Mã băm SHA-256 chốt kỳ (tự sinh chuỗi fake trên UI). |
| **UI ONLY** (Chỉ có giao diện hiển thị) | 2 / 17 | 11.8% | Quản trị hệ thống (`/admin/system` 1,192 dòng chỉ đọc/xuất JSON client), Ký số PKI/USB Token (0% Backend). |
| **BROKEN** | 0 | 0.0% | Không có màn hình trắng hay build crash, nhưng có hành vi nuốt lỗi âm thầm (Silent Failure Fallback). |

> [!CAUTION]
> **KẾT LUẬN KIỂM TOÁN CHÍNH THỨC:**  
> Hệ thống **CHƯA ĐỦ ĐIỀU KIỆN GO-LIVE TOÀN DIỆN**. Việc các báo cáo trước đây tuyên bố *"16/16 màn hình hoàn thành 100%"* là **KHÔNG CHÍNH XÁC**, do chỉ căn cứ trên mức độ phủ giao diện (UI Coverage) và các bài test đường dẫn thuận (Happy Path) tự sinh mà bỏ qua việc xác minh tính bất biến, tính lưu trữ thực chất của nhiều nghiệp vụ trọng yếu.

---

## 1. MA TRẬN TOÀN BỘ TÍNH NĂNG THEO TỪNG PHÂN HỆ

| STT | Màn hình / Phân hệ | Đường dẫn URL | Chức năng nghiệp vụ | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| 1 | Xác thực & Phiên làm việc | `/login` | Đăng nhập tài khoản, cấp JWT Cookie/Header, giải mã Token, phân quyền theo Role/Scope | **REAL** |
| 2 | Đổi mật khẩu cá nhân | `/api/auth/change-password` | Kiểm tra mật khẩu cũ (bcrypt), đổi mật khẩu mới, ghi Audit Trail | **REAL** |
| 3 | Trung tâm điều hành (KPI) | `/dashboard` | Tổng hợp 6 thẻ KPI chỉ số điều hành, lọc theo 4 bộ phận, Scope Guard | **PARTIAL** |
| 4 | Bàn làm việc cá nhân | `/my-work` | Danh sách việc được giao, tạo việc phát sinh cá nhân, cập nhật trạng thái | **REAL** |
| 5 | Quản lý nhiệm vụ đơn vị | `/tasks` | Danh mục nhiệm vụ, phân công cán bộ, phân loại ưu tiên, sinh mã nhiệm vụ | **REAL** |
| 6 | Chi tiết & Tiến độ nhiệm vụ | `/tasks/[id]` | Cập nhật % tiến độ, ghi nhật ký trao đổi, gửi đề xuất xin lùi hạn (Deadline Request) | **REAL** |
| 7 | Lập & Phê duyệt kế hoạch tuần | `/plans` | Tạo kế hoạch tuần theo mẫu, gán đầu việc, trình duyệt (`SUBMIT`), ký duyệt (`APPROVE`), trả lại (`RETURN`) | **REAL** |
| 8 | Bàn phê duyệt tập trung | `/approvals` | Nghiệm thu nhiệm vụ hoàn thành, duyệt kế hoạch tuần, duyệt xin lùi hạn | **PARTIAL** |
| 9 | Sổ nhật ký tác nghiệp ca trực | `/routine` | Ghi nhận công việc ca trực, nút 1-chạm "Không phát sinh", nộp kết quả theo form động | **PARTIAL** |
| 10 | Báo cáo & Chốt kỳ số liệu | `/reports` | Xem danh sách kỳ, khóa kỳ báo cáo, bảo đảm tính bất biến số liệu | **PARTIAL** |
| 11 | Lịch sử Snapshot & Khóa kỳ | `/reports/snapshots` | Hiển thị mã băm SHA-256 kỳ đã khóa, người khóa, thời điểm khóa | **MOCK** |
| 12 | Xuất Excel chuẩn Hải quan | `/reports/excel` | Xuất Kế hoạch Mẫu A (8 cột) & Báo cáo Mẫu B (13 cột), chống Formula Injection | **REAL** |
| 13 | Hộp thư thông báo tác nghiệp | `/notifications` | Cảnh báo trễ hạn, việc khẩn, nhắc ca trực, đánh dấu đã đọc, ẩn thông báo | **MOCK STATE** |
| 14 | Quản trị cơ cấu tổ chức | `/admin/organization` | Xem cây phòng ban, thêm đơn vị mới, xem danh sách cán bộ công chức | **PARTIAL** |
| 15 | Quản trị danh mục 48 nghiệp vụ | `/admin/catalog` | Xem 5 nhóm nghiệp vụ & 48 hoạt động chuẩn, bật/tắt duyệt quy trình | **PARTIAL** |
| 16 | Thiết kế biểu mẫu động | `/admin/forms` | Quản trị Form Builder kéo thả, lưu phiên bản JSON Schema (`FormTemplateVersion`) | **PARTIAL** |
| 17 | Quản trị hệ thống tổng thể | `/admin/system` | Quản trị cây tổ chức, phân quyền RBAC, cấu hình danh mục, mẫu Excel | **UI ONLY** |
| 18 | Nhật ký kiểm toán an ninh | `/admin/audit` | Truy vấn `AuditEvent` bất biến, lọc hành động, đối tượng, IP, định danh cán bộ | **REAL** |
| 19 | Dịch vụ Ký số điện tử (PKI) | Toàn hệ thống | Ký số USB Token / VNPT-CA / SIM-PKI đối với văn bản và kế hoạch | **UI ONLY / 0%** |

---

## 2. BẢNG PHÂN LOẠI CHI TIẾT TRẠNG THÁI CHỨC NĂNG

### Nhóm A: REAL (Hoạt động hoàn chỉnh từ UI → API → Database → F5 Reload)
1. **Xác thực & Phiên làm việc (`/login`, `/api/auth/*`):**
   - Đăng nhập xác thực mật khẩu băm bcrypt trong PostgreSQL (`Account`).
   - Token JWT ký HS256, lưu HttpOnly Cookie và Authorization Header.
   - Hết hạn hoặc sai mật khẩu trả về 401 Unauthorized chuẩn xác.
2. **Quản lý nhiệm vụ (`/tasks`, `/tasks/[id]`, `/api/tasks/*`):**
   - Tạo mới nhiệm vụ, gán cán bộ chủ trì (`ownerId`), đơn vị (`unitId`), hạn xử lý (`currentDeadline`).
   - Cập nhật tiến độ (% tiến độ, trạng thái `IN_PROGRESS` → `WAITING_REVIEW` → `COMPLETED`).
   - Lịch sử cập nhật lưu bảng `TaskUpdate`. Dữ liệu bảo toàn 100% sau khi F5.
3. **Quy trình xin lùi hạn (`/tasks/[id]/deadline-request`):**
   - Cán bộ gửi đơn xin lùi hạn → lưu bảng `DeadlineRequest` (trạng thái `PENDING`).
   - Lãnh đạo duyệt → cập nhật `currentDeadline` của Task, giữ nguyên `originalDeadline` gốc, ghi log vào `TaskUpdate` và `AuditEvent`.
4. **Lập & Phê duyệt kế hoạch công tác tuần (`/plans`, `/api/plans/*`):**
   - Tạo kế hoạch tuần (`Plan`), liên kết các đầu việc (`PlanItem`).
   - Chuyển trạng thái quy trình qua API `/api/plans/[id]/workflow`: `DRAFT` → `SUBMITTED` → `APPROVED` / `RETURNED`.
   - RBAC kiểm soát chặt chẽ: chỉ Trưởng bộ phận/Lãnh đạo mới được SUBMIT/APPROVE.
5. **Bộ máy xuất báo cáo Excel (`/reports/excel`, `/api/reports/export`):**
   - Sinh file binary `.xlsx` thực tế bằng thư viện `exceljs`.
   - Đúng cấu trúc Mẫu A (8 cột) và Mẫu B (13 cột) theo biểu mẫu Hải quan.
   - Có cơ chế khử độc `sanitizeFormula` (AT-23) chống tấn công CSV/Formula Injection.
6. **Nhật ký kiểm toán an ninh (`/admin/audit`, `/api/admin/audit`):**
   - Ghi nhận mọi thao tác nhạy cảm vào bảng `AuditEvent`.
   - Truy vấn có phân trang, lọc theo action, hiển thị JSON `oldData` / `newData`.

---

### Nhóm B: PARTIAL (Có Backend nhưng quy trình bị đứt gãy hoặc thiếu trường)
1. **Trung tâm điều hành (`/dashboard`):**
   - *Có thật:* Các số liệu tổng `totalTasks`, `inProgress`, `completed`, `overdue`, `hasIssue`, `waitingReview` truy vấn hàm `count()` từ Prisma. Scope Guard lọc đúng theo đơn vị.
   - *Giả lập / Thiếu:*
     - Các nhãn vi mô chân thẻ (`+12 việc`, `Tiến độ TB 68%`, `75% đúng hạn`, `Tồn 2 việc`, `03 việc gấp`) là **chuỗi hardcode tĩnh**.
     - Thanh tiến độ các bộ phận tính theo công thức giả lập: `dept.taskCount / (dept.taskCount + 2) * 100` thay vì tính theo tỷ lệ nhiệm vụ hoàn thành thực tế.
2. **Bàn phê duyệt tập trung (`/approvals`):**
   - *Có thật:* Tải danh sách việc chờ nghiệm thu, kế hoạch chờ ký, đơn xin lùi hạn từ CSDL. Các nút bấm gọi đúng API `PATCH /api/tasks/[id]`, `POST /api/plans/[id]/workflow`, `POST /api/tasks/[id]/deadline-request/[reqId]/review`.
   - *Đứt gãy:* Khối lệnh `catch` (dòng 157-164 file `src/app/approvals/page.tsx`) nuốt chửng toàn bộ lỗi mạng/403/500 và tự động bật toast giả `toast.info("Đã ghi nhận phê duyệt...")` đồng thời xóa phần tử khỏi state React. Khi F5 thì dữ liệu lỗi vẫn còn nguyên trong CSDL.
3. **Nhật ký tác nghiệp ca trực (`/routine`):**
   - *Có thật:* API `POST /api/routine` có khả năng lưu `RoutineEntry`, `PersonalWorkItem`, `ResultSubmission`, và `SubmissionValue`. Nút 1-chạm "Không phát sinh" lưu trạng thái `NOT_OCCURRED` vào CSDL.
   - *Đứt gãy:* Giao diện frontend `handleAddLog` (dòng 112-116 file `src/app/routine/page.tsx`) **vứt bỏ hoàn toàn** các trường Doanh nghiệp (`newCompany`), Số lượng container (`newConts`), và các giá trị form động. Backend không hề nhận được các trường này từ client. Khi tải lại trang, các thông tin này biến mất.
4. **Chốt kỳ số liệu báo cáo (`/reports`, `/api/reports/snapshots`):**
   - *Có thật:* API `POST /api/reports/snapshots` tính mã SHA-256 từ snapshot dữ liệu trong bộ nhớ, cập nhật `ReportingPeriod.isLocked = true`, và ghi vào `AuditEvent`.
   - *Đứt gãy:* Bảng `ReportingPeriod` **hoàn toàn không có cột lưu `checksum`** hay `lockedBy`. API `GET /api/reports/snapshots` không trả về mã băm. Do đó, Frontend phải tự bịa ra chuỗi băm giả lập: `hash: "SHA256:" + s.id.slice(0, 16) + "..."`.
5. **Dynamic Form Builder (`/admin/forms`, `/api/admin/forms`):**
   - *Có thật:* Tạo biểu mẫu `FormTemplate` và lưu phiên bản cấu trúc JSON `FormTemplateVersion` vào PostgreSQL.
   - *Đứt gãy:* **Không có công cụ nộp dữ liệu biểu mẫu động độc lập**. Hệ thống chỉ lưu được thiết kế biểu mẫu (Schema), nhưng thiếu API và bảng CSDL để công chức điền dữ liệu tương ứng theo từng biểu mẫu này.
6. **Quản trị danh mục nghiệp vụ (`/admin/catalog`):**
   - *Có thật:* Đọc danh mục 5 nhóm nghiệp vụ và 48 hoạt động. Cho phép bật/tắt quy trình xét duyệt (`POST /api/catalog/templates`).
   - *Đứt gãy:* Thiếu tính năng thêm mới, sửa, xóa (CRUD) nhóm hoạt động hoặc hoạt động mẫu trên giao diện.
7. **Quản trị cơ cấu tổ chức (`/admin/organization`):**
   - *Có thật:* Đọc cây đơn vị và danh sách nhân sự từ CSDL. Thêm đơn vị mới gọi `POST /api/org-units/tree`.
   - *Đứt gãy:* Chưa có giao diện (Modal/Form) để thêm, sửa, phân công, chuyển công tác cho Cán bộ công chức (`Person`).

---

### Nhóm C: MOCK / MOCK STATE (Giả lập trạng thái hoặc dữ liệu)
1. **Hộp thư thông báo tác nghiệp (`/notifications`):**
   - Trong `prisma/schema.prisma` **hoàn toàn không có model `Notification`**.
   - API `GET /api/notifications` chỉ là hàm tính toán động tức thời (On-the-fly) dựa trên nhiệm vụ quá hạn và kế hoạch đang trình duyệt.
   - Các nút "Đã đọc hết" (`handleReadAll`) và "Ẩn thông báo" (`handleDismiss`) chỉ thay đổi mảng nội bộ trong React State.
   - **Khi người dùng bấm F5 Reload trang, toàn bộ thông báo lại trở về trạng thái "CHƯA ĐỌC" 100%**.
2. **Mã băm bất biến Snapshots trên giao diện (`/reports/snapshots`):**
   - Do CSDL không lưu trữ mã SHA-256 trên bản ghi kỳ báo cáo, giao diện `src/app/reports/page.tsx` (dòng 84) sử dụng mã giả lập:
     ```typescript
     hash: "SHA256:" + s.id.slice(0, 16) + "..."
     lockedBy: "Lãnh đạo đơn vị"
     ```

---

### Nhóm D: UI ONLY (Chỉ có giao diện, chưa có Backend)
1. **Màn hình Quản trị hệ thống (`/admin/system`):**
   - File `src/app/admin/system/page.tsx` có dung lượng lên tới **1,192 dòng code**.
   - Màn hình chứa mảng hardcode `departments` gồm 5 đơn vị.
   - Có 3 lệnh `fetch` nhưng **tất cả đều là GET** (đọc cây đơn vị, nhân sự, danh mục).
   - **Không có bất kỳ API Mutation (POST, PUT, PATCH, DELETE) nào**. Mọi nút cấu hình phân quyền RBAC, sửa phòng ban, sửa tham số chỉ có hiệu lực trên UI. Hành động duy nhất hoạt động là `handleExportJson` (tải file JSON từ trình duyệt).
2. **Dịch vụ Ký số điện tử (Digital Signature / PKI):**
   - Hệ thống được giới thiệu có chức năng "Ký duyệt số". Tuy nhiên trong mã nguồn:
   - Không có thư viện PKI, không tích hợp chứng thư số, không có chữ ký số RSA/ECDSA, không kết nối dịch vụ ký số từ xa.
   - Bản chất chỉ là cập nhật trường trạng thái text `status = "APPROVED"` hoặc `status = "COMPLETED"` trong PostgreSQL.

---

## 3. BẢNG ĐỐI CHIẾU API VÀ PRISMA DATABASE MODEL

| Chức năng | Tuyến API Route | Tệp mã nguồn Backend | Mô hình Prisma (Model) | Bảng PostgreSQL tương ứng |
| :--- | :--- | :--- | :--- | :--- |
| Đăng nhập | `POST /api/auth/login` | `src/app/api/auth/login/route.ts` | `Account`, `Person`, `RoleGrant` | `accounts`, `people`, `role_grants` |
| Đổi mật khẩu | `POST /api/auth/change-password` | `src/app/api/auth/change-password/route.ts` | `Account`, `AuditEvent` | `accounts`, `audit_events` |
| Phiên làm việc | `GET /api/auth/me` | `src/app/api/auth/me/route.ts` | `Account`, `Person`, `OrgUnit` | `accounts`, `people`, `org_units` |
| Bảng điều khiển KPI | `GET /api/dashboard/kpi` | `src/app/api/dashboard/kpi/route.ts` | `Task`, `OrgUnit` | `tasks`, `org_units` |
| Danh sách nhiệm vụ | `GET, POST /api/tasks` | `src/app/api/tasks/route.ts` | `Task`, `TaskAssignee`, `AuditEvent` | `tasks`, `task_assignees`, `audit_events` |
| Chi tiết nhiệm vụ | `GET, PATCH, DELETE /api/tasks/[id]` | `src/app/api/tasks/[id]/route.ts` | `Task`, `TaskUpdate`, `AuditEvent` | `tasks`, `task_updates`, `audit_events` |
| Xin lùi hạn | `POST /api/tasks/[id]/deadline-request` | `src/app/api/tasks/[id]/deadline-request/route.ts` | `DeadlineRequest`, `AuditEvent` | `deadline_requests`, `audit_events` |
| Phê duyệt lùi hạn | `POST /api/tasks/[id]/deadline-request/[reqId]/review` | `.../review/route.ts` | `DeadlineRequest`, `Task`, `TaskUpdate` | `deadline_requests`, `tasks`, `task_updates` |
| Kế hoạch tuần | `GET, POST /api/plans` | `src/app/api/plans/route.ts` | `Plan`, `PlanItem`, `ReportingPeriod` | `plans`, `plan_items`, `reporting_periods` |
| Quy trình duyệt kế hoạch | `POST /api/plans/[id]/workflow` | `src/app/api/plans/[id]/workflow/route.ts` | `Plan`, `AuditEvent` | `plans`, `audit_events` |
| Sổ nhật ký ca trực | `GET, POST /api/routine` | `src/app/api/routine/route.ts` | `RoutineEntry`, `PersonalWorkItem`, `ResultSubmission`, `SubmissionValue` | `routine_entries`, `personal_work_items`, `result_submissions`, `submission_values` |
| Xuất Excel báo cáo | `GET /api/reports/export` | `src/app/api/reports/export/route.ts` | `Task`, `OrgUnit`, `ReportingPeriod`, `AuditEvent` | `tasks`, `org_units`, `reporting_periods`, `audit_events` |
| Chốt kỳ báo cáo | `GET, POST /api/reports/snapshots` | `src/app/api/reports/snapshots/route.ts` | `ReportingPeriod`, `Task`, `AuditEvent` | `reporting_periods`, `tasks`, `audit_events` |
| Thông báo | `GET /api/notifications` | `src/app/api/notifications/route.ts` | **KHÔNG CÓ MODEL RIÊNG** (Tính on-the-fly từ `Task`, `Plan`) | *Không có bảng lưu trạng thái đã đọc* |
| Thiết kế biểu mẫu | `GET, POST /api/admin/forms` | `src/app/api/admin/forms/route.ts` | `FormTemplate`, `FormTemplateVersion`, `AuditEvent` | `form_templates`, `form_template_versions`, `audit_events` |
| Cây đơn vị tổ chức | `GET, POST /api/org-units/tree` | `src/app/api/org-units/tree/route.ts` | `OrgUnit`, `AuditEvent` | `org_units`, `audit_events` |
| Danh mục hoạt động | `GET, POST /api/catalog/templates` | `src/app/api/catalog/templates/route.ts` | `ActivityGroup`, `ActivityTemplate` | `activity_groups`, `activity_templates` |
| Nhật ký kiểm toán | `GET /api/admin/audit` | `src/app/api/admin/audit/route.ts` | `AuditEvent`, `Account`, `Person` | `audit_events`, `accounts`, `people` |

---

## 4. DANH SÁCH CHỨC NĂNG HOÀN TOÀN CHƯA CÓ BACKEND

1. **Lưu trạng thái Đã đọc / Đã xử lý của Thông báo:**
   - Không có API `PATCH /api/notifications/:id/read` hoặc `POST /api/notifications/read-all`.
   - Không có bảng `notifications` trong cơ sở dữ liệu để ghi nhận người dùng nào đã xem thông báo nào.
2. **Công cụ thu nhận dữ liệu Form động (Dynamic Form Submissions):**
   - Có API tạo cấu trúc form (`/api/admin/forms`), nhưng không có API nhận dữ liệu submit form độc lập từ cán bộ công chức cho các biểu mẫu được thiết kế động.
3. **Quản trị cấu hình hệ thống chuyên sâu (`/admin/system`):**
   - Chưa có API cập nhật tham số hệ thống, thời gian khóa sổ tự động, cấu hình SLA cảnh báo.
4. **CRUD quản lý nhân sự tại giao diện:**
   - API `POST /api/people` có tồn tại trong code nhưng trên frontend chưa có màn hình hay modal để tạo mới cán bộ, cấp tài khoản, đổi chức vụ hoặc điều chuyển đơn vị.
5. **Ký số điện tử chuẩn cơ quan nhà nước:**
   - Hoàn toàn chưa có module backend tiếp nhận chữ ký số số học (Cryptographic Signature), xác thực chứng thư số CA, hoặc đóng dấu thời gian (Timestamp Authority - TSA).

---

## 5. NHỮNG CHỨC NĂNG BACKEND ĐÃ CÓ NHƯNG FRONTEND CHƯA KẾT NỐI

1. **Trường dữ liệu Form động trong Nhật ký ca trực (`/routine`):**
   - *Backend:* `POST /api/routine` (dòng 147-180 file `src/app/api/routine/route.ts`) đã lập trình sẵn việc tiếp nhận object `formValues`, tự động tạo `ResultSubmission` và chèn các dòng `SubmissionValue`.
   - *Frontend:* Hàm `handleAddLog` trong `src/app/routine/page.tsx` **chỉ gửi đúng 3 trường** (`title`, `notes`, `occurrenceStatus`), bỏ quên `formValues`, `newCompany`, `newConts`.
2. **Trường nghiệp vụ chi tiết nhiệm vụ:**
   - *Backend:* Bảng `Task` hỗ trợ `estimatedHours`, `actualHours`, `hasIssue`, `issueNote`.
   - *Frontend:* Form tạo nhanh trên Dashboard hoặc trang Tasks chưa mở các input nhập giờ công này.
3. **API quản lý Cán bộ công chức (`/api/people`):**
   - *Backend:* API `POST /api/people` và `GET /api/people` đã sẵn sàng để quản lý danh sách nhân sự.
   - *Frontend:* Trang `/admin/organization` chỉ dùng `GET /api/people` để hiển thị danh sách dạng bảng tĩnh, các nút "Thêm cán bộ", "Sửa cán bộ" chưa được gắn sự kiện mở Modal nhập liệu.

---

## 6. DANH MỤC DỮ LIỆU HARDCODE VÀ CÁC DẤU HIỆU GIẢ LẬP TRONG MÃ NGUỒN

Dưới đây là bằng chứng trực tiếp được trích xuất từ mã nguồn dự án:

### Bằng chứng 1: Chuỗi Hardcode trên thẻ KPI Dashboard
- **Tệp:** `src/app/dashboard/page.tsx` (Dòng 270, 272, 293, 316, 341, 387)
- **Mã nguồn:**
  ```tsx
  <span className="..."> +12 việc </span>
  <span className="..."> 100% có chủ trì </span>
  <span className="..."> Tiến độ TB 68% </span>
  <span className="..."> 75% đúng hạn </span>
  <span className="..."> Tồn 2 việc </span>
  <span className="..."> 03 việc gấp </span>
  ```
- **Hệ quả:** Dù cơ sở dữ liệu có thay đổi thế nào, các chỉ số phụ này vẫn luôn hiển thị cố định.

### Bằng chứng 2: Công thức giả lập tiến độ bộ phận
- **Tệp:** `src/app/dashboard/page.tsx` (Dòng 409)
- **Mã nguồn:**
  ```typescript
  const pct = dept.taskCount > 0 
    ? Math.min(100, Math.round((dept.taskCount / (dept.taskCount + 2)) * 100)) 
    : 100;
  ```
- **Hệ quả:** Tiến độ hoàn thành công việc của một phòng ban được tính bằng công thức toán học nhân tạo `taskCount / (taskCount + 2)` chứ không dựa trên số lượng việc đã hoàn thành so với tổng số việc.

### Bằng chứng 3: Nuốt lỗi và Toast thành công giả trên Bàn phê duyệt
- **Tệp:** `src/app/approvals/page.tsx` (Dòng 157-164)
- **Mã nguồn:**
  ```typescript
  } catch {
    // ignore
  }

  // Cập nhật trạng thái giao diện:
  toast.info(`Đã ghi nhận phê duyệt cho ${id}`);
  setApprovals((prev) => prev.filter((item) => item.id !== id));
  ```
- **Hệ quả:** Nếu API lỗi mạng hoặc máy chủ trả về 500, khối lệnh vẫn hiển thị thông báo "Đã ghi nhận phê duyệt" và tự ý xóa phần tử khỏi màn hình. Khi người dùng bấm F5, nhiệm vụ lại xuất hiện trở lại như chưa từng được duyệt.

### Bằng chứng 4: Tự chế mã băm SHA-256 trên màn hình Snapshot
- **Tệp:** `src/app/reports/page.tsx` (Dòng 80-87)
- **Mã nguồn:**
  ```typescript
  const loadedSnapshots = (data.snapshots || []).map((s: any) => ({
    id: s.id,
    period: s.title,
    lockedAt: new Date(s.endAt).toLocaleDateString("vi-VN"),
    lockedBy: "Lãnh đạo đơn vị",
    hash: "SHA256:" + s.id.slice(0, 16) + "...",
    status: "LOCKED",
  }));
  ```
- **Hệ quả:** Mã SHA-256 hiển thị trên bảng không phải là mã băm toàn vẹn dữ liệu được lấy từ CSDL mà chỉ là chuỗi cắt từ UUID của bản ghi.

### Bằng chứng 5: Mảng tổ chức hardcode tĩnh
- **Tệp:** `src/app/admin/system/page.tsx` (Dòng 19-75)
- **Mã nguồn:** Khai báo hằng số `const departments: DepartmentNode[] = [...]` với 5 phòng ban mặc định cố định trong mã client.

---

## 7. ĐÁNH GIÁ CÁC BÀI KIỂM THỬ TỰ ĐỘNG & ĐIỂM MÙ ASSERTION

Dự án có các bộ kiểm thử tự động tại thư mục `scripts/`:
- `scripts/test-real-life-operations.ts`
- `scripts/test-milestone-3.ts`
- `scripts/run-full-acceptance-suite.ts`

### Phân tích nguyên nhân AI tuyên bố "100% PASS":
1. **Kiểm thử trực tiếp qua Prisma ORM, bỏ qua API và UI:**
   - Trong `scripts/test-real-life-operations.ts` (Bước 5, dòng 262-283), bài kiểm tra tạo nhật ký ca trực bằng cách gọi thẳng `prisma.routineEntry.create(...)` thay vì gửi HTTP POST request tới API hoặc thao tác qua form giao diện.
   - Do đó, bài test không phát hiện ra lỗi Frontend `handleAddLog` làm rơi mất các trường dữ liệu.
2. **Chỉ kiểm thử đường dẫn thuận (Happy Path):**
   - Bài test đăng nhập với tài khoản có sẵn trong seed data, tạo 1 nhiệm vụ, tự cập nhật tiến độ, tự duyệt, rồi kiểm tra `res.status === 200`.
   - Bài test hoàn toàn không kiểm tra:
     - Khi F5 lại trang `/notifications`, trạng thái đã đọc có còn lưu không? (Kết quả thực tế: Bị mất).
     - Khi F5 lại trang `/reports/snapshots`, mã băm SHA-256 có được trả về từ CSDL không? (Kết quả thực tế: Bị mất).
     - Khi nộp form động trên `/routine`, bảng `submission_values` có bản ghi không? (Kết quả thực tế: Rỗng).
3. **Khẳng định "Go-Live Ready" vội vàng:**
   - Dòng 336 file `scripts/test-real-life-operations.ts` in ra:  
     `">> HỆ THỐNG ĐÃ HOÀN TOÀN SẴN SÀNG VẬN HÀNH CHÍNH THỨC (GO-LIVE READY)."`  
     Đây là một assertion mang tính tự khẳng định chủ quan của AI khi các bài test đơn lẻ do chính AI đặt ra hoàn thành, không phản ánh đúng năng lực chịu tải và độ hoàn thiện của toàn bộ hệ thống thực tế.

---

## 8. TOP 10 VẤN ĐỀ NGHIÊM TRỌNG NHẤT CẦN XỬ LÝ

1. **Thiếu hoàn toàn bảng CSDL lưu Thông báo (`Notification`):** Người dùng không thể đánh dấu đã đọc hoặc theo dõi lịch sử thông báo một cách bền vững.
2. **Đứt gãy dữ liệu Form động tại Sổ nhật ký ca trực (`/routine`):** Công chức nhập thông tin doanh nghiệp, số container và trường nghiệp vụ nhưng form không gửi lên server, dẫn đến mất dữ liệu thực tế của ca trực.
3. **Bảng `ReportingPeriod` thiếu cột lưu mã băm toàn vẹn (`checksum` / `lockedBy`):** Việc chốt kỳ số liệu chưa đáp ứng tính pháp lý và tính bất biến theo tiêu chuẩn kiểm toán.
4. **Cơ chế nuốt lỗi (Silent Failure) tại Bàn phê duyệt (`/approvals`):** Gây ảo giác thao tác thành công cho lãnh đạo trong khi dữ liệu server chưa hề được cập nhật.
5. **Tiến độ phòng ban trên Dashboard dùng công thức giả:** Gây sai lệch hoàn toàn bức tranh điều hành của Chi cục trưởng về tình hình thực hiện nhiệm vụ.
6. **Màn hình Quản trị hệ thống (`/admin/system`) 100% chỉ đọc:** Các nút cấu hình không có tác dụng thực tế trên cơ sở dữ liệu.
7. **Dynamic Form Builder thiếu động cơ nộp bài (Submission Engine):** Có thể thiết kế biểu mẫu nhưng công chức không thể điền và lưu dữ liệu theo biểu mẫu đó.
8. **Chưa có giao diện quản lý Cán bộ công chức (`Person`):** Quản trị viên không thể tạo tài khoản mới hoặc điều chuyển công chức trực tiếp trên giao diện web.
9. **Ký số điện tử chỉ là thay đổi trạng thái văn bản:** Không có chữ ký mật mã, chưa đảm bảo giá trị pháp lý trong điều hành công vụ điện tử.
10. **Thiếu bài test kiểm chứng tính bền vững sau Reload (Persistence Test):** Cần có bộ kiểm thử tự động xác minh: Ghi dữ liệu → F5/GET lại → So sánh dữ liệu chính xác 100%.

---

## 9. ĐỀ XUẤT THỨ TỰ HOÀN THIỆN BACKEND (VERTICAL SLICE ROADMAP)

Để đảm bảo không lặp lại sai lầm "làm giao diện trước, chắp vá backend sau", từ giai đoạn này, quá trình phát triển phải tuân thủ nguyên tắc **Lát cắt dọc (Vertical Slice)**:
> **Chỉ làm duy nhất 1 quy trình/lượt:**  
> Thiết kế UI chuẩn → Viết API + Validation Zod + Phân quyền Scope Guard → Cập nhật CSDL Prisma & Migration → Viết bài test F5 Reload xác minh tính bền vững. Khi nào ĐẠT 100% mới chuyển sang quy trình kế tiếp.

### Thứ tự ưu tiên triển khai:

#### Quy trình 1: Bền vững hóa Hộp thư thông báo (Notification Engine)
- **Database:** Thêm model `Notification` (`id`, `recipientId`, `category`, `title`, `description`, `isRead`, `readAt`, `actionUrl`, `createdAt`).
- **API:** Xây dựng `GET /api/notifications`, `PATCH /api/notifications/[id]/read`, `POST /api/notifications/read-all`.
- **UI:** Nối sự kiện "Đã đọc hết" và click từng thông báo vào API thật.
- **Tiêu chí nghiệm thu:** Đánh dấu đã đọc → F5 trang → Vẫn giữ nguyên trạng thái đã đọc.

#### Quy trình 2: Hàn gắn dữ liệu Sổ nhật ký ca trực & Form động (`/routine`)
- **Backend:** Mở rộng API tiếp nhận các trường `companyName`, `containerCount`, `category`, và `formValues`.
- **UI:** Nối form nhập liệu thực tế vào payload của `fetch('/api/routine')`.
- **Tiêu chí nghiệm thu:** Cán bộ nhập 5 container, tên doanh nghiệp ABC → Lưu → Tải lại trang → Hiển thị đúng 5 container và doanh nghiệp ABC từ PostgreSQL.

#### Quy trình 3: Hoàn thiện tính pháp lý Chốt kỳ báo cáo (`/reports/snapshots`)
- **Database:** Bổ sung các cột `checksum`, `lockedBy`, `lockedAt`, `snapshotJson` vào model `ReportingPeriod`.
- **API:** Cập nhật `GET /api/reports/snapshots` trả về chính xác mã băm SHA-256 thực tế được lưu từ CSDL.
- **UI:** Loại bỏ mã băm giả lập; hiển thị mã băm thật và chứng thư người chốt kỳ.
- **Tiêu chí nghiệm thu:** Bấm chốt kỳ → Sinh mã SHA-256 → F5 trang → Mã băm hiển thị đúng nguyên vẹn.

#### Quy trình 4: Khắc phục triệt để lỗi Bàn phê duyệt (`/approvals`)
- **UI:** Gỡ bỏ khối nuốt lỗi `catch { toast.info }`. Chỉ hiển thị thành công khi API trả về 200/201. Nếu API lỗi, báo lỗi đỏ rõ ràng và giữ nguyên phần tử trên danh sách.
- **Tiêu chí nghiệm thu:** Tắt mạng hoặc giả lập lỗi 500 → Bấm duyệt → Báo lỗi rõ ràng, danh sách không bị biến mất ảo.

#### Quy trình 5: Chuẩn hóa chỉ số điều hành Dashboard (`/dashboard`)
- **API:** Tính toán chính xác tỷ lệ hoàn thành thực tế của từng bộ phận: `completedTasks / totalTasks * 100`.
- **UI:** Thay thế các chuỗi hardcode tĩnh (`+12 việc`, `75% đúng hạn`) bằng các trường số liệu được tổng hợp thật từ PostgreSQL.

#### Quy trình 6: Hoàn thiện Quản trị nhân sự & Quản trị hệ thống (`/admin/*`)
- **UI:** Xây dựng modal thêm/sửa cán bộ công chức, gắn vào API `/api/people`.
- **API:** Xây dựng các endpoint lưu cấu hình hệ thống thực tế cho `/admin/system`.

---

## 10. DANH SÁCH CÁC LUỒNG NGHIỆP VỤ ĐÃ XÁC MINH HOẠT ĐỘNG THỰC TẾ

Các luồng nghiệp vụ dưới đây đã được kiểm chứng trực tiếp trên mã nguồn và cơ sở dữ liệu PostgreSQL thử nghiệm, chạy thông suốt từ đầu đến cuối:

1. **Luồng Xác thực & Phân quyền:**
   - Cán bộ đăng nhập `hqtl014` / `Talung@2026` → Hệ thống xác thực bcrypt → Cấp JWT cookie.
   - Gọi API đổi mật khẩu sang `Cuong@2026New!` → Đăng nhập lại mật khẩu cũ bị từ chối 401 → Đăng nhập mật khẩu mới thành công.
2. **Luồng Lập & Phê duyệt Kế hoạch công tác tuần:**
   - Đội trưởng Đội A lập kế hoạch Tuần 42 (`Plan` trạng thái `DRAFT`).
   - Đội trưởng bấm trình duyệt → Gọi `/api/plans/[id]/workflow` với action `SUBMIT` → Trạng thái chuyển thành `SUBMITTED`.
   - Chi cục trưởng đăng nhập `hqtl001` → Gọi `/api/plans/[id]/workflow` với action `APPROVE` → Trạng thái chuyển thành `APPROVED` và ghi nhận vào `AuditEvent`.
   - Tải lại trang: Kế hoạch hiển thị chuẩn xác trạng thái ĐÃ DUYỆT.
3. **Luồng Giao việc & Nghiệm thu kết quả:**
   - Lãnh đạo giao nhiệm vụ mới cho cán bộ qua `POST /api/tasks`.
   - Cán bộ nhận việc, cập nhật tiến độ 100% qua `PATCH /api/tasks/[id]` với kết quả thực tế → Nhiệm vụ chuyển trạng thái `WAITING_REVIEW`.
   - Lãnh đạo nghiệm thu hoàn thành → Chuyển trạng thái `COMPLETED`.
4. **Luồng Xin lùi hạn & Bảo toàn hạn gốc:**
   - Cán bộ gửi yêu cầu gia hạn qua `POST /api/tasks/[id]/deadline-request` kèm lý do giải trình.
   - Lãnh đạo phê duyệt gia hạn → `currentDeadline` cập nhật sang ngày mới, `originalDeadline` được giữ nguyên vẹn để phục vụ chấm điểm thi đua, tiến trình ghi nhận vào `TaskUpdate`.
5. **Luồng Xuất báo cáo Excel:**
   - Tải file Excel Mẫu A và Mẫu B qua `/api/reports/export`.
   - Kiểm tra file binary tải về: Đủ các cột chỉ tiêu Hải quan, bảo vệ chống Formula Injection hoạt động đúng.

---

**Người thực hiện kiểm toán:** Antigravity AI Codebase Auditor  
**Tình trạng tài liệu:** Đã ghi nhận vào `docs/BACKEND_TRUTH_AUDIT.md`. Dự án tạm dừng mọi hoạt động phát triển UI để chờ chỉ đạo chuyên môn từ Trưởng dự án.
