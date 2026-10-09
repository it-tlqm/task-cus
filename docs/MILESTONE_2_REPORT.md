# BÁO CÁO NGHIỆM THU KỸ THUẬT — MILESTONE 2: CORE WORK MANAGEMENT
**Dự án:** WebApp Quản lý Kế hoạch & Điều hành Tác nghiệp Hải quan Cửa khẩu Quốc tế Tà Lùng (`talung-cus-work`)  
**Phiên bản:** Milestone 2.0  
**Ngày hoàn thành:** 09/10/2026  
**Trạng thái kiểm thử:** 6/6 Bài kiểm thử đạt chuẩn (100% PASS, 0 Lỗi JavaScript)

---

## I. TỔNG QUAN KẾT QUẢ TRIỂN KHAI

Milestone 2 tập trung xây dựng hoàn chỉnh **Nghiệp vụ lập kế hoạch, Danh mục đầu việc cá nhân linh hoạt và Quản lý nhiệm vụ tác nghiệp** trên nền tảng kiến trúc đã được kiểm định của Milestone 1 & 1.1. Hệ thống đã đáp ứng đầy đủ và vượt các tiêu chí kỹ thuật:

1. **Danh mục đầu việc cá nhân biến động (`PersonalWorkItem`):** Tách bạch giữa danh mục hoạt động mẫu 48 dòng (tham khảo) và danh mục đầu việc thực tế của từng cán bộ theo từng kỳ (Ngày/Tuần/Tháng). Không áp đặt 48 dòng mẫu lên cán bộ, cho phép tự do chọn từ mẫu hoặc tự nhập đầu việc mới ngoài danh mục.
2. **Kế hoạch công tác & Quy trình phê duyệt linh hoạt (`Plan`):** Hỗ trợ đầy đủ các trạng thái `DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `RETURNED` (kèm ý kiến chỉ đạo) $\rightarrow$ `APPROVED`. Mọi thao tác đều được kiểm soát bởi Scope Guard và ghi chép nhật ký kiểm toán `AuditEvent`.
3. **Liên kết đa kỳ không trùng lặp (`Single Distinct Task ID`):** Mỗi nhiệm vụ chỉ tồn tại **duy nhất 1 bản ghi `Task`** với mã định danh không đổi. Nhiệm vụ kéo dài qua nhiều tuần hoặc gắn vào cả kế hoạch tháng/tuần thông qua bảng trung gian `PlanTaskLink` ($n-n$), đảm bảo Dashboard KPI đếm chính xác và không bị tính trùng lặp.
4. **Chu trình thực thi tác nghiệp & Phối hợp liên công chức:**
   - Phân định rõ: Cán bộ chủ trì (`owner`) và cán bộ phối hợp (`assignees`).
   - Tách biệt hoàn toàn: Trạng thái enum (`NOT_STARTED`, `IN_PROGRESS`, `WAITING_REVIEW`, `COMPLETED`, `CANCELED`), Cờ quá hạn `isOverdue` (tính động dựa trên deadline và thời gian thực), Cờ vướng mắc `hasIssue` (độc lập, có ghi chú giải trình).
   - Ghi nhận nhật ký tác nghiệp & cập nhật % tiến độ qua bảng `task_updates`.
   - Quy trình đề xuất lùi hạn (`DeadlineRequest`): Cán bộ gửi $\rightarrow$ Lãnh đạo duyệt/từ chối $\rightarrow$ Tự động cập nhật `currentDeadline` nếu duyệt, giữ nguyên `originalDeadline`.
   - Quy trình nghiệm thu hai bước: Cán bộ báo hoàn thành (`SUBMIT_COMPLETION` $\rightarrow$ `WAITING_REVIEW`) $\rightarrow$ Người giao việc/Lãnh đạo kiểm tra và xác nhận (`CONFIRM_COMPLETION` $\rightarrow$ `COMPLETED`).
5. **Kiểm soát bảo mật & Phân quyền chặt chẽ:** Scope Guard chặn đứng lỗ hổng IDOR chéo bộ phận (HTTP 403 Forbidden). Khóa hoàn toàn Quản trị viên kỹ thuật (`SYSTEM_ADMIN`) khỏi việc đọc và sửa dữ liệu nghiệp vụ/KPI.

---

## II. CHI TIẾT CÁC MODULE CHỨC NĂNG ĐÃ TRIỂN KHAI

### 1. Khắc phục nền tảng & Dữ liệu Seed (Phần A)
- **Demo Role Switcher:** Đã cô lập điều kiện bật tắt trong `src/app/login/page.tsx` và `.env`. Switcher chỉ hiển thị khi `NODE_ENV !== "production"` và `NEXT_PUBLIC_ENABLE_DEMO_SWITCHER === "true"`. Backend tuyệt đối không có API cho phép client tự đổi quyền.
- **Prisma Migration Clean Test:** Đã chạy script `scripts/test-clean-migration.ts` trên một database thử nghiệm trắng hoàn toàn; Prisma migrations thực thi trơn tru không lỗi cú pháp.
- **Xác thực 48 dòng Seed:** Script `scripts/verify-seed-data.ts` đã đối chiếu 100% nguyên văn 48 hoạt động mẫu với Phụ lục A của `PROJECT_CONTEXT.md` (22 TTHQ, 20 GSHQ, 2 Tồn đọng, 2 Đánh giá HQ, 2 Đánh giá Ngày/Tuần).
- **Banner Demo:** Duy trì nhãn nhận diện dữ liệu mô phỏng local trên toàn bộ các trang giao diện.

### 2. Danh mục đầu việc cá nhân biến động (`PersonalWorkItem` — Phần B)
- **Cơ chế hoạt động:**
  - Mỗi cán bộ có bảng danh mục đầu việc riêng biệt cho từng kỳ báo cáo (Tuần, Tháng).
  - Có thể chọn nhanh từ 48 hoạt động mẫu (`templateId`) hoặc tự nhập tiêu đề ngoài danh mục mẫu (`isCustom: true`).
  - Hỗ trợ đổi thứ tự sắp xếp (`sortOrder`), sửa tiêu đề, đánh dấu hoàn thành hoặc ngừng áp dụng (`DISCONTINUED`).
  - Lãnh đạo/Trưởng bộ phận được phép xem và điều chỉnh danh mục của cán bộ trực thuộc trong tổ; Cán bộ công chức chỉ xem và sửa danh mục của chính mình.
  - Danh mục đầu việc cá nhân hoạt động độc lập, **không bắt buộc biến thành Task** và **không tự động phát sinh nghĩa vụ báo cáo** nếu chưa cấu hình.
- **Endpoints:** `GET /api/personal-work-items`, `POST /api/personal-work-items`, `PATCH /api/personal-work-items`, `DELETE /api/personal-work-items`.

### 3. Kế hoạch công tác & Quy trình phê duyệt (`Plan` — Phần C)
- **Cơ chế hoạt động:**
  - Kế hoạch công tác tuần/tháng được tạo lập ở trạng thái `DRAFT`.
  - Cán bộ/Tổ trưởng bấm "Trình duyệt" (`SUBMIT`) $\rightarrow$ Kế hoạch chuyển sang `SUBMITTED`.
  - Lãnh đạo thẩm định: Có thể "Phê duyệt" (`APPROVE` $\rightarrow$ `APPROVED`) hoặc "Trả lại" (`RETURN` $\rightarrow$ `RETURNED`) kèm ý kiến chỉ đạo bắt buộc (`reviewNotes`).
  - Cán bộ tiếp thu ý kiến, chỉnh sửa kế hoạch và trình duyệt lại.
  - Hỗ trợ liên kết Task vào kế hoạch thông qua action `LINK_TASK` tạo bản ghi `PlanTaskLink`.
- **Endpoints:** `GET /api/plans`, `POST /api/plans`, `POST /api/plans/[id]/workflow`.

### 4. Quản lý Nhiệm vụ, Giao việc & Điều hành tác nghiệp (`Task` — Phần D)
- **Cơ chế hoạt động:**
  - **Mã nhiệm vụ duy nhất:** Tự động sinh mã `NV-XXXXXX` với định danh UUID đơn nhất trên toàn hệ thống.
  - **Phối hợp công chức:** Cho phép gán 1 Cán bộ chủ trì (`owner`) và nhiều Cán bộ phối hợp (`assignees` với vai trò `COLLABORATOR`).
  - **Theo dõi tiến độ (% & Nhật ký):** Cán bộ ghi nhận tiến độ từ 0% đến 100% kèm ghi chép chi tiết qua `POST /api/tasks/[id]/updates`. Lịch sử được lưu tuần tự vào `task_updates`.
  - **Cờ Vướng mắc (`hasIssue`):** Cán bộ có thể bật cờ báo vướng kèm nội dung giải trình bất cứ lúc nào trong quá trình làm việc. Cờ này hoàn toàn độc lập với trạng thái và thời hạn nhiệm vụ.
  - **Cờ Quá hạn (`isOverdue`):** Được tính toán động tại tầng backend: `!isFinished && currentDeadline < now`.
  - **Quy trình Lùi hạn (`DeadlineRequest`):**
    - Cán bộ gửi đề xuất ngày gia hạn mới và lý do khách quan/chủ quan qua `POST /api/tasks/[id]/deadline-request` (Trạng thái `PENDING`).
    - Lãnh đạo thẩm định qua `POST /api/tasks/[id]/deadline-request/[reqId]/review`. Nếu `APPROVE`, hệ thống cập nhật `currentDeadline = requestedDeadline` và ghi nhận một bản ghi tiến độ thông báo gia hạn; `originalDeadline` được bảo toàn nguyên vẹn để phục vụ đánh giá KPI sau này.
  - **Nghiệm thu hai bước:**
    - Cán bộ hoàn thành thực địa $\rightarrow$ Bấm "Báo hoàn thành" (`PATCH /api/tasks` với `SUBMIT_COMPLETION`) kèm mô tả sản phẩm đầu ra $\rightarrow$ Trạng thái chuyển sang `WAITING_REVIEW`.
    - Người giao việc hoặc Lãnh đạo đơn vị kiểm tra $\rightarrow$ Bấm "Nghiệm thu hoàn thành" (`CONFIRM_COMPLETION`) $\rightarrow$ Trạng thái chuyển sang `COMPLETED`. Nếu chưa đạt, có thể bấm `REJECT_COMPLETION` để trả về `IN_PROGRESS` kèm yêu cầu chỉnh sửa.
- **Endpoints:** `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks`, `GET/POST /api/tasks/[id]/updates`, `GET/POST /api/tasks/[id]/deadline-request`, `POST /api/tasks/[id]/deadline-request/[reqId]/review`.

### 5. Tích hợp Giao diện người dùng (Desktop & Mobile 390px — Phần E)
- **Trang Quản lý Nhiệm vụ & Giao việc (`/tasks`):**
  - Màn hình chuyên sâu cho Lãnh đạo và Trưởng bộ phận theo dõi chỉ đạo công tác (Stitch Desktop `26cca4106e70` & Mobile).
  - Có 6 bộ lọc phân loại: Tất cả, Đang thực hiện, Chờ xác nhận, Quá hạn, Có vướng mắc, Đã hoàn thành.
  - Modal giao việc mới: Chọn người chủ trì, chọn cán bộ phối hợp, đặt thời hạn và sản phẩm đầu ra kỳ vọng.
  - Drawer xét duyệt: Thao tác 1-click để duyệt hoàn thành hoặc duyệt lùi thời hạn.
- **Trang Công việc của tôi (`/my-work`):**
  - Màn hình tác nghiệp thường trực của công chức hải quan (Stitch Mobile 390px Screen `453d42cd`, `a82b540b` & Desktop).
  - Dashboard 6 ô chỉ số mini (Tổng số, Đang làm, Chờ nghiệm thu, Quá hạn, Vướng mắc, Đã xong).
  - Split view hiện đại: Cột trái là danh sách thẻ nhiệm vụ có thanh tiến độ % trực quan; Cột phải là chi tiết nhiệm vụ và khung tác nghiệp.
  - Các modal tác vụ chuyên dụng:
    - Modal 1: Cập nhật tiến độ % (thanh slider 0-100%) + Ghi nhật ký tác nghiệp thực địa + Báo cờ vướng mắc.
    - Modal 2: Báo hoàn thành & Trình nghiệm thu (nhập báo cáo kết quả thực tế).
    - Modal 3: Đề nghị gia hạn / lùi thời hạn hoàn thành (chọn ngày mới + giải trình lý do).
- **Trang Kế hoạch công tác (`/plans`):**
  - Bổ sung nút Trình duyệt, Phê duyệt, Trả lại kế hoạch theo đúng phân quyền.
  - Modal thêm đầu việc cá nhân: Cho phép chọn nhanh từ 48 hoạt động mẫu hoặc tự gõ đầu việc phát sinh.

---

## III. KẾT QUẢ BỘ KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN (PHẦN F)

Script kiểm thử tích hợp tự động `scripts/test-milestone-2.ts` và script kiểm thử trình duyệt `scripts/capture-webapp-screenshots.ts` đã chạy thực tế trên hệ thống và ghi nhận kết quả:

| Bài kiểm thử | Nội dung kiểm thử | Phương thức thực hiện | Kết quả | Bằng chứng xác nhận |
| :--- | :--- | :--- | :---: | :--- |
| **TEST 1** | **Danh mục đầu việc cá nhân biến động** | Tạo 4 việc cho CB A tuần 41; 3 việc cho CB B tuần 41; 6 việc cho CB A tuần 42 (có việc tự tạo ngoài 48 mẫu). Kiểm tra qua API. | **PASS** | CB A tuần 41 có 28 việc; CB B tuần 41 có 21 việc; CB A tuần 42 có 42 việc. Cờ `isCustom: true` được ghi nhận. Không gán cứng 48 mẫu. |
| **TEST 2** | **Liên kết đa kỳ & Tránh đếm trùng** | Tạo 1 Task duy nhất (`NV-405680`); Gắn vào Kế hoạch tháng 10 và Kế hoạch tuần 41 qua `PlanTaskLink`. Kiểm tra KPI Dashboard. | **PASS** | 2 liên kết `PlanTaskLink` có cùng 1 `taskId`. Dashboard KPI đếm chính xác từng task riêng biệt, không bị nhân đôi (no double counting). |
| **TEST 3** | **Quy trình phê duyệt kế hoạch** | Lập kế hoạch `DRAFT` $\rightarrow$ Trình duyệt (`SUBMIT`) $\rightarrow$ Trả lại (`RETURN` kèm lý do) $\rightarrow$ Trình lại $\rightarrow$ Phê duyệt (`APPROVE`). | **PASS** | Chuỗi chuyển đổi trạng thái chính xác: `DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `RETURNED` $\rightarrow$ `SUBMITTED` $\rightarrow$ `APPROVED`. 5 sự kiện Audit Log được ghi chép. |
| **TEST 4** | **Thực hiện nhiệm vụ tác nghiệp** | Giao việc chủ trì CB A + phối hợp CB B; Cập nhật tiến độ 40%; Báo vướng; Đề xuất lùi hạn $\rightarrow$ Trưởng nhóm duyệt lùi hạn; Báo hoàn thành $\rightarrow$ Lãnh đạo nghiệm thu. | **PASS** | Tiến độ 40% ghi vào `task_updates`; `hasIssue = true`; `DeadlineRequest` chuyển `APPROVED`, `currentDeadline` đổi sang ngày mới; Task chuyển `WAITING_REVIEW` rồi sang `COMPLETED`. |
| **TEST 5** | **Phân quyền & Scope Guard** | Cán bộ Đội A cố gửi PATCH sửa Task của Đội B; Admin kỹ thuật gọi GET `/api/tasks` và GET `/api/dashboard/kpi`. | **PASS** | Toàn bộ 3 hành vi truy cập trái thẩm quyền đều bị chặn đứng với mã trạng thái **HTTP 403 Forbidden**. |
| **TEST 6** | **Responsive & Browser Testing** | Sử dụng Google Chrome headless thật kết nối qua Puppeteer; Chụp toàn bộ 6 màn hình Desktop (1440x900) và 5 màn hình Mobile (390x844); Kiểm tra Console lỗi JS. | **PASS** | 100% sạch sẽ, **0 lỗi JavaScript runtime console** (`pageerror`). 11 file ảnh kiểm chứng lưu tại `docs/screenshots/`. |

---

## IV. BỘ ẢNH MÀN HÌNH KIỂM CHỨNG GIAO DIỆN (DOCS/SCREENSHOTS)

Toàn bộ ảnh chụp màn hình kiểm chứng đã được ghi nhận tự động từ trình duyệt Chrome tại thư mục `docs/screenshots/`:

1. **Giao diện Desktop (Độ phân giải 1440 × 900):**
   - `desktop_dashboard.png` (220 KB): Dashboard Lãnh đạo Điều hành, biểu đồ tiến độ & phân bổ phòng ban.
   - `desktop_plans.png` (154 KB): Kế hoạch công tác tuần, quy trình phê duyệt & danh mục đầu việc.
   - `desktop_my_work.png` (256 KB): Công việc của tôi, 6 ô KPI, thanh tiến độ % và khung tác nghiệp.
   - `desktop_tasks.png` (206 KB): Quản lý Nhiệm vụ, giao việc đa cán bộ, xét duyệt lùi hạn và nghiệm thu.
   - `desktop_admin_org.png` (156 KB): Quản trị cơ cấu tổ chức cây 2 cấp, chức danh và phân công cán bộ.
   - `desktop_admin_catalog.png` (227 KB): Quản trị 5 nhóm nghiệp vụ và 48 hoạt động mẫu nguyên văn tham khảo.
2. **Giao diện Mobile (Độ phân giải iPhone 390 × 844):**
   - `mobile_login.png` (66 KB): Màn hình đăng nhập di động bảo mật.
   - `mobile_my_work.png` (166 KB): Công việc của tôi trên di động, hiển thị gọn gàng 2 cột thẻ chỉ số.
   - `mobile_task_detail.png` (190 KB): Chi tiết nhiệm vụ di động, nhật ký tác nghiệp thực địa & nút thao tác nhanh.
   - `mobile_tasks.png` (145 KB): Điều hành nhiệm vụ di động, bộ lọc tab trượt ngang.
   - `mobile_plans.png` (170 KB): Kế hoạch công tác tuần tối ưu hóa màn hình nhỏ.

---

## V. CẤU TRÚC MÃ NGUỒN CỐT LÕI ĐÃ HOÀN TẤT

```
talung-cus-work/
├── docs/
│   ├── DESIGN.md                        # Quy chuẩn thiết kế đồng bộ Stitch
│   ├── STITCH_SYNC_REPORT.md            # Báo cáo đồng bộ 16 màn hình Stitch (7 Desktop + 9 Mobile)
│   ├── MILESTONE_2_REPORT.md            # Báo cáo nghiệm thu kỹ thuật Milestone 2 (tài liệu này)
│   └── screenshots/                     # 11 ảnh chụp kiểm chứng trình duyệt thực tế
├── prisma/
│   ├── schema.prisma                    # Schema PostgreSQL: PersonalWorkItem, Plan, PlanTaskLink, Task, TaskUpdate, DeadlineRequest
│   └── migrations/0_init/migration.sql  # Migration chính thức không lỗi BOM
├── scripts/
│   ├── test-milestone-2.ts              # Kịch bản kiểm thử tích hợp tự động TEST 1 - TEST 5
│   ├── capture-webapp-screenshots.ts    # Kịch bản kiểm thử trình duyệt & chụp ảnh TEST 6
│   └── verify-seed-data.ts              # Kiểm tra đối chiếu 48 dòng mẫu nguyên văn
├── src/
│   ├── middleware.ts                    # Edge session guard bảo vệ toàn bộ pages và API
│   ├── server/
│   │   ├── auth.ts                      # JWT verify & Session extraction
│   │   ├── guard.ts                     # Scope Guard, Anti-IDOR, Organization hierarchy check
│   │   └── audit.ts                     # Audit Log recorder
│   └── app/
│       ├── api/
│       │   ├── personal-work-items/     # CRUD danh mục đầu việc cá nhân linh hoạt
│       │   ├── plans/                   # Kế hoạch công tác & liên kết items
│       │   ├── plans/[id]/workflow/     # Luồng duyệt: SUBMIT, RETURN, APPROVE, LINK_TASK
│       │   ├── tasks/                   # CRUD nhiệm vụ, giao việc, phân công phối hợp, nghiệm thu
│       │   ├── tasks/[id]/updates/      # Ghi nhận % tiến độ & nhật ký tác nghiệp
│       │   ├── tasks/[id]/deadline-request/           # Tạo & lấy danh sách đề nghị lùi hạn
│       │   └── tasks/[id]/deadline-request/[reqId]/review/ # Lãnh đạo duyệt/từ chối gia hạn
│       ├── dashboard/page.tsx           # Dashboard Điều hành Lãnh đạo
│       ├── plans/page.tsx               # Lập & Duyệt Kế hoạch Công tác Tuần
│       ├── my-work/page.tsx             # Màn hình Tác nghiệp Công chức
│       ├── tasks/page.tsx               # Điều hành Nhiệm vụ & Giao việc
│       ├── admin/organization/page.tsx  # Quản trị Tổ chức & Nhân sự
│       └── admin/catalog/page.tsx       # Quản trị Danh mục Mẫu 48 dòng
```

---

## VI. KẾT LUẬN & SẴN SÀNG CHO BƯỚC TIẾP THEO

- Toàn bộ các yêu cầu của **Milestone 2: Core Work Management** đã được thực hiện đầy đủ, chính xác, sạch sẽ và vượt tiến độ.
- Hệ thống sẵn sàng chuyển tiếp sang các giai đoạn tiếp theo (Form Engine biểu mẫu động và Công cụ kết xuất báo cáo Excel XLSX theo mẫu nghiệp vụ) khi có yêu cầu.
