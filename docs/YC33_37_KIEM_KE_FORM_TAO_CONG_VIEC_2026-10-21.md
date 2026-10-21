# KIỂM KÊ CÁC FORM TẠO CÔNG VIỆC — AS-IS / TO-BE

**Giai đoạn 3 · 21/10/2026 · Phạm vi: KHẢO SÁT, chưa tái cấu trúc**
Yêu cầu: *"Kiểm kê tất cả các nơi tạo công việc… Xác định từng màn hình đang tạo bản ghi gì, dữ liệu có bị trùng không, có liên thông với kết quả đánh giá không. Viết báo cáo AS-IS và đề xuất TO-BE. KHÔNG tự gộp database, thay toàn bộ form hoặc xóa luồng cũ."*

---

## 1. Bảng kiểm kê AS-IS

| # | Màn hình / Luồng | API | Bảng ghi tạo | Nguồn đầu việc | Hạn / Ngày hoàn thành | Minh chứng | Liên thông kết quả đánh giá | Nguy cơ trùng |
|---|---|---|---|---|---|---|---|---|
| F1 | **Nhật ký công việc** — "+ Thêm việc mới (Tùy biến)" | `POST /api/tasks` | `tasks` (+ `task_assignees`) | **Tự nhập tên** (không chọn từ danh mục) | Hạn (`currentDeadline`) | `task_attachments` | Qua `personal_work_items.taskId` | **CAO** — tạo Task rời, không gắn danh mục TX/QĐ1277 → không tính được điểm |
| F2 | **Lập kế hoạch** — "+ Thêm đầu việc công tác" | `POST /api/plans` (item) | `plan_items` | Chọn: **Danh mục TX** / mẫu cũ 48 / danh mục QĐ1277 / tự nhập | Không (chưa có hạn ở cấp plan item) | Không | `personal_work_items.planItemId` | Thấp — 1 plan item → 1 đầu việc cá nhân (unique) |
| F3 | **Đầu việc kế hoạch** (YC-32) — tạo từ hạng mục kế hoạch | `POST /api/personal-work-items` | `personal_work_items` | `planItemId` (từ F2) hoặc `catalogEntryId` / `productItemId` / tự nhập | `dueDate`, `completedDate` | `work_evidences` | **CÓ** — `monthly_work_results.workItemId` (unique person+workItem) | Thấp |
| F4 | **Công việc phát sinh** — lãnh đạo giao việc | `POST /api/tasks` | `tasks` (+ `task_assignees`) | Tự nhập tên; có thể gắn `planItemId` | `currentDeadline` | `task_attachments` | Qua `personal_work_items.taskId` | **CAO** — tách vòng bản ghi Task ↔ WorkItem |
| F5 | **Nhật ký tác nghiệp** (ca trực) | `POST /api/routine` | `routine_entries` + **`personal_work_items`** + `result_submissions` | Mẫu nghiệp vụ / danh mục sản phẩm | Có (theo ca) | Không (dùng `result_submissions`) | Có (WorkItem sinh kèm) | **CAO** — sinh thêm 1 bản ghi công việc |
| F6 | **Giao việc từ biên bản giao ban** | `POST /api/meetings/[id]` | `tasks` | Từ nội dung biên bản | Có | Không | Không trực tiếp | Thấp |
| F7 | **Giao việc từ văn bản đến** | `POST /api/docs` | `tasks` | Từ văn bản | Có | Không | Không trực tiếp | Thấp |
| F8 | **Phân công ca trực** | `POST /api/rosters`, `/api/rosters/day-info` | `duty_rosters`, `duty_day_infos` | Lịch trực | Theo ca | Không | **KHÔNG** (không sinh WorkItem) | Thấp — nhưng **không liên thông kết quả đánh giá** |

### Kết luận trùng dữ liệu
- **Hai bảng "công việc" song song**: `tasks` (nhiệm vụ được giao) và `personal_work_items` (đầu việc theo dõi/đánh giá).
  Liên kết: `personal_work_items.taskId` (không có unique → **1 Task có thể sinh nhiều WorkItem**, và 1 WorkItem có thể **không** gắn Task nào).
- **F1/F4 tạo Task không gắn danh mục** → cán bộ nhập lại tên việc, không sinh được hệ số → không tính điểm, không vào biểu 01A/02A.
- **F5 (nhật ký tác nghiệp) sinh thêm `personal_work_items`** → cùng một việc có thể xuất hiện ở cả nhật ký tác nghiệp và nhật ký công việc (2 bản ghi, 1 việc) → **vi phạm nguyên tắc "một công việc gốc — một lần nhập"**.
- **F8 (ca trực) không sinh WorkItem** → công việc ca trực không vào kết quả đánh giá. (CV 2431: đánh giá **theo quý**; ca trực là đầu vào "kết quả thực hiện nhiệm vụ" nhưng hệ thống chưa nối.)

### Bằng chứng nghiệp vụ liên quan (Công văn 2431/HQKV16-TCCB ngày 25/9/2026)
- **Mục I.1.4 — nguyên tắc "6 rõ"**: *"rõ người, rõ việc, rõ thời gian, rõ trách nhiệm, rõ sản phẩm, rõ thẩm quyền; **một việc chỉ phân công một đầu mối (cá nhân hoặc bộ phận) chủ trì giải quyết, xử lý**"*.
  → Hệ thống hiện **chưa có trường "đầu mối chủ trì"** ở cấp Task: `ownerId` (chủ sở hữu) và `task_assignees` (phối hợp) là hai khái niệm khác nhau; chưa có cờ xác định đầu mối chủ trì, chưa chặn gán nhiều người cùng "chủ trì".
- **Mục I.1.2**: *"cá nhân được giao chủ trì thực hiện xác định mục tiêu, nhiệm vụ, sản phẩm công việc và kết quả cần đạt được của từng kỳ đánh giá"* → `expectedResultText` (Task) + `expectedResult` (WorkItem) là hai chỗ **cùng ý nghĩa, tách rời**.
- **Mục I.1.3**: *"kế hoạch công tác và Danh mục sản phẩm/công việc … đã ban hành"* → `plan_items` (có nguồn danh mục) và `tasks` (thường **không** có nguồn danh mục) → không bảo đảm 1 nguồn chuẩn.
- **Mục IV.1.1.c**: hồ sơ quý gồm **02A/02B + báo cáo kết quả thực hiện nhiệm vụ theo mẫu 2C + bảng tổng hợp mẫu 2D + bảng chỉ tiêu mẫu 2E** → hệ thống hiện xuất được **02A/02B**; **2C/2D/2E chưa triển khai** (ngoài phạm vi đã giao).

---

## 2. Đề xuất TO-BE (KHÔNG triển khai trong đợt này)

> Nguyên tắc: **một công việc gốc — một lần nhập — nhiều cách theo dõi và tổng hợp.**

| # | Đề xuất | Mức độ | Rủi ro | Giai đoạn |
|---|---|---|---|---|
| T1 | Thêm cờ `isPrimaryOwner` (đầu mối chủ trì) cho `task_assignees`; chặn >1 đầu mối chủ trì/task; hiển thị rõ trên UI giao việc | Cao (theo "một đầu mối" của CV 2431) | Thấp — additive | Giai đoạn 4 |
| T2 | Khi tạo Task từ màn Nhật ký công việc / Công việc phát sinh: **bắt buộc chọn nguồn** (Danh mục TX / sản phẩm QĐ1277 / tự nhập) và **ghi nhận kết quả cần đạt** (`expectedResultText`) | Cao | Thấp | Giai đoạn 4 |
| T3 | `POST /api/routine` **không tự sinh `personal_work_items`**; chỉ tạo `routine_entries`. Nếu cần theo dõi đánh giá → tạo WorkItem **từ WorkItem đã có**, không tạo bản ghi song song | Cao (vi phạm "một lần nhập") | **Trung bình** — có thể ảnh hưởng báo cáo lịch sử | Giai đoạn 4 (cần đối chiếu dữ liệu thật trước) |
| T4 | Thống nhất nguồn "kết quả cần đạt": `work_items.expectedResult` là chuẩn; `tasks.expectedResultText` chỉ hiển thị, không tạo thêm ô nhập | Trung bình | Thấp | Giai đoạn 4 |
| T5 | Ràng buộc 1 Task ↔ 1 WorkItem theo kỳ: unique `(task_id, period_id)` trên `personal_work_items` | Trung bình | **Cao** nếu dữ liệu thật đang vi phạm → phải rà soát trước | Giai đoạn 4 (cần báo cáo dữ liệu) |
| T6 | Ca trực (`duty_rosters`) → sinh WorkItem khi có kết quả thực hiện (nếu Hải quan xác nhận ca trực là đầu vào đánh giá) | Thấp | Trung bình — phụ thuộc nghiệp vụ | Chờ Hải quan xác nhận |
| T7 | Báo cáo "trùng" tự động: số Task không có WorkItem, số WorkItem không có Task, số Task có >1 WorkItem | Cao (giá trị kiểm định) | Rất thấp (chỉ đọc) | Giai đoạn 4 |
| T8 | Xuất 2C (báo cáo kết quả thực hiện nhiệm vụ của đơn vị) — **LƯU Ý**: file `kehoach-thang-02c-template.xlsx` hiện đang là **kế hoạch tháng** mang nhãn 02C, trong khi CV 2431 + Công văn 892/HQTL 02/10/2026 quy định **02C là báo cáo kết quả các lĩnh vực công tác của đơn vị (theo quý)** | Cao | Trung bình — cần đổi tên/nội dung, không xoá lịch sử | Giai đoạn 4 |

---

## 3. Không làm trong đợt này (theo đúng yêu cầu)
- ❌ Không gộp bảng `tasks` và `personal_work_items`.
- ❌ Không thay toàn bộ form tạo công việc.
- ❌ Không xoá luồng cũ.
- ❌ Không triển khai mẫu 2C/2D/2E (ngoài phạm vi được giao; mẫu 2D theo CV 1601 đã bị CV 2431 **thay thế**).

## 4. Cần Hải quan xác nhận
1. **Đầu mối chủ trì**: xác nhận mô hình "1 việc = 1 đầu mối chủ trì (cá nhân hoặc bộ phận)" — hệ thống hiện cho phép nhiều người cùng "chủ trì".
2. **Ca trực** có phải là đầu vào của kết quả đánh giá theo quý không?
3. **Mẫu 2C**: xác nhận dùng bản "Báo cáo KQ các lĩnh vực công tác của đơn vị" (theo CV 2431) — và cho biết có dùng lại file `Mẫu 2C Báo cáo KQ...docx` trong bộ hồ sơ gốc không.
