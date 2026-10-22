# CHECKLIST UAT GIAO DIỌN PRODUCTION — V3 (22/10/2026)

**URL:** https://task-cus.vercel.app · **Phiên bản đang chạy:** `6b0fa94` + bản vá rà soát sau phát hành (kiểm tra SHA tại `/api/health` → trường `commit`).
**Cách điền:** mỗi bước ghi `✔ / ✘ / N/A` + ghi chú lỗi (nếu có) vào cột **Kết quả**. Báo lại bước `✘` kèm ảnh chụp màn hình + thời điểm.

> **Điều kiện trước khi UAT được:**
> - [ ] Có **tài khoản kiểm thử** (chủ dự án cấp) — mật khẩu demo cũ **không** dùng được trên Production.
> - [ ] Có **2 tuyến phê duyệt DEMO** (`demold01 → democb01`, `demold01 → democb02`) — hiện `person_supervisions = 0` ⇒ **không ai duyệt được** hồ sơ cho tới khi có tuyến (bản vá đã chặn đúng nghiệp vụ).
> - [ ] Nhật ký tác nghiệp / minh chứng: cần kho private `work-evidence` + `SUPABASE_SERVICE_ROLE_KEY` trên Production (hiện chưa có minh chứng thật nên các bước liên quan tệp đánh dấu **N/A** cho tới khi cấu hình xong).

---

## A. ĐĂNG NHẬP & PHÂN QUYỀN

| # | Bước kiểm tra | Kỳ vọng | Kết quả |
|---|---|---|---|
| A1 | Mở `/login` | Trang hiển thị đầy đủ, tiêu đề đúng, không lỗi console | |
| A2 | Đăng nhập bằng tài khoản kiểm thử (cán bộ) | Vào `/my-work`, hiện đúng họ tên + đơn vị | |
| A3 | Đăng nhập bằng tài khoản lãnh đạo | Menu hiện thêm mục *"Xác nhận công việc"* (phê duyệt) | |
| A4 | Mở `/admin/permissions` bằng lãnh đạo | Thấy 5 nhóm A–E, danh sách vai trò/tài khoản/đơn vị; **không** thấy nút cấp quyền nghiệp vụ cho SYSTEM_ADMIN | |
| A5 | Mở `/admin/supervisions` | Thấy danh sách tuyến phê duyệt (hiện trống nếu chưa gán) | |
| A6 | Thử truy cập `/admin/permissions` bằng tài khoản STAFF | Bị chặn (403 / chuyển hướng), **không** xem được dữ liệu quản trị | |
| A7 | So sánh vai trò hiển thị trên đầu màn hình với quyền thực tế | Khớp (lỗi lệch vai trò đã sửa ở bản vá) | |

## B. NHẬT KÝ CÔNG VIỆC (cán bộ tự ghi nhận)

| # | Bước kiểm tra | Kỳ vọng | Kết quả |
|---|---|---|---|
| B1 | `/my-work` → tạo đầu việc mới (tiêu đề có tiền tố `[UAT]` để dễ dọn) | Tạo được; trạng thái hiện **"Chưa gửi lãnh đạo"**; **ngày hoàn thành trống** (không tự điền) | |
| B2 | Mở đầu việc vừa tạo | Nút chính **"Báo hoàn thành & gửi lãnh đạo"** tương phản rõ (≥ 4.5:1), KHÔNG còn đường tắt "hoàn thành" | |
| B3 | Bấm gửi **không nhập nội dung kết quả** | Bị từ chối, báo *"Vui lòng nhập nội dung kết quả công việc (ít nhất 5 ký tự)"* | |
| B4 | Bấm gửi **không chọn ngày hoàn thành** | Bị từ chối, báo đúng lỗi ngày | |
| B5 | Nhập nội dung + chọn ngày → gửi | Thành công; trạng thái **"Đã gửi — chờ lãnh đạo xác nhận"**; có mục trong lịch sử xử lý | |
| B6 | Thử sửa đầu việc sau khi đã gửi | **Bị khoá** (HTTP 409) — thông báo rõ *"đã gửi lãnh đạo, đã khoá chỉnh sửa"* | |
| B7 | Thử thêm minh chứng sau khi đã gửi | Bị khoá (R3-C) | |
| B8 | Tự bấm *"Xác nhận"* trên đầu việc của chính mình | **Bị chặn 403** — không ai tự duyệt việc của mình | |
| B9 | Mở lại danh sách `/my-work` | Đầu việc hiển thị đúng nhãn trạng thái + badge dự thảo/chính thức (nếu có) | |
| B10 | Kiểm tra thông báo (biểu tượng chuông) | Nhận được thông báo khi bị trả lại / được xác nhận | |

## C. NHẬT KÝ TÁC NGHIỆP (F18/F19)

| # | Bước kiểm tra | Kỳ vọng | Kết quả |
|---|---|---|---|
| C1 | Mở `/routine` | Chỉ hiện **danh mục TX mới** (348 mã), **không** còn selector 48 mẫu cũ, **không** có mã giả `KPS-01`/`TTHQ-01` | |
| C2 | Chọn TX + chọn **nhiều sản phẩm QĐ1277** | Chọn được ≥ 2 SP; mỗi SP có hệ số + đơn vị tính hiển thị rõ; SP **chưa có đơn vị tính** hiện *"chưa có (cần đối chiếu)"* — không tự suy | |
| C3 | Lưu nhật ký tác nghiệp | Lưu được; hiện trạng thái *"Chưa gửi lãnh đạo"*; nguồn dữ liệu ghi rõ (TX / SP / thủ công) | |
| C4 | Mở lại nhật ký đã lưu | Đúng số lượng SP, đúng hệ số đã chụp, không mất dòng | |
| C5 | Kiểm tra trường DN/container theo biểu mẫu | Có trường *Doanh nghiệp* và *Container* theo biểu mẫu; không có trường giả | |
| C6 | Gửi nhật ký tác nghiệp lên lãnh đạo | Chuyển sang *"Đã gửi — chờ lãnh đạo xác nhận"*, có lịch sử | |

## D. XÁC NHẬN CÔNG VIỆC (lãnh đạo) — **cần tuyến phê duyệt**

| # | Bước kiểm tra | Kỳ vọng | Kết quả |
|---|---|---|---|
| D1 | Lãnh đạo mở `/work-item-reviews` (hồ sơ chờ xác nhận) | Chỉ thấy hồ sơ của **cán bộ mình là lãnh đạo trực tiếp**; thấy lịch sử gửi → trả lại → gửi lại → xác nhận | |
| D2 | Hồ sơ của cán bộ **không** thuộc tuyến của mình | **Không** xuất hiện trong danh sách; nếu gọi thẳng API ⇒ 403 | |
| D3 | Cán bộ **chưa có tuyến phê duyệt** | Hồ sơ không ai xác nhận được; thông báo *"chưa có tuyến phê duyệt hợp lệ — hồ sơ đang chờ phân tuyến"* (bản vá mới) | |
| D4 | Lãnh đạo bấm **"Xác nhận hoàn thành"** | Thành công; trạng thái **"Đã được lãnh đạo xác nhận"**; hồ sơ bị khoá không sửa được | |
| D5 | Lãnh đạo bấm **"Trả lại để chỉnh sửa"** không ghi lý do | Bị từ chối, yêu cầu ghi rõ lý do | |
| D6 | Lãnh đạo trả lại có lý do | Trạng thái *"Lãnh đạo trả lại — cần chỉnh sửa và gửi lại"*; cán bộ **được sửa lại và gửi lại** | |
| D7 | Mở tab **Lịch sử phê duyệt** (4 tab: chờ duyệt / đã xác nhận / đã trả lại / tất cả) | Lọc theo trạng thái và theo tháng hoạt động đúng | |
| D8 | Kiểm tra quyền của **Super Admin kỹ thuật** (nếu có tài khoản) | **Không** xác nhận được hồ sơ nghiệp vụ | |

## E. XÁC NHẬN SẢN PHẨM QĐ1277 (từng SP độc lập)

| # | Bước kiểm tra | Kỳ vọng | Kết quả |
|---|---|---|---|
| E1 | Mở đầu việc có nhiều SP | Danh sách SP, mỗi SP có trạng thái riêng (chờ duyệt / đã duyệt / bị từ chối) | |
| E2 | Lãnh đạo xác nhận **1 SP** | Chỉ SP đó chuyển sang *"Đã xác nhận"*; **hệ số được chụp lại** tại thời điểm xác nhận (không sửa danh mục) | |
| E3 | Lãnh đạo **từ chối 1 SP** không ghi lý do | Bị từ chối, yêu cầu ghi rõ lý do | |
| E4 | SP **chưa duyệt** trong kết quả tháng | **Không** tính điểm chính thức; hiển thị rõ *"chưa được xác nhận"* | |
| E5 | Cố xác nhận SP của hồ sơ đã CONFIRMED | Bị chặn 409 *"Công việc đã được xác nhận — không thể thay đổi sản phẩm"* | |
| E6 | Cán bộ **tự xác nhận SP của mình** | Bị chặn 403 | |

## F. KẾT QUẢ CÔNG TÁC THÁNG & PHÂN QUYỀN

| # | Bước kiểm tra | Kỳ vọng | Kết quả |
|---|---|---|---|
| F1 | Mở `/reports` hoặc `/monthly-results` (kỳ 10/2026) | Mỗi dòng có nhãn **DỰ THẢO** khi chưa đủ điều kiện chính thức | |
| F2 | Hồ sơ đã được lãnh đạo xác nhận | Hiện **chính thức**, dùng được để tính điểm | |
| F3 | Hồ sơ còn thiếu hệ số / SP chưa duyệt | Vẫn là **DỰ THẢO**, không tự suy hệ số | |
| F4 | Mở bản nháp | Thấy các bản nháp tách riêng, không lẫn vào số liệu chính thức | |
| F5 | `/admin/permissions` → nhóm A (Vai trò) | Thêm/sửa được vai trò và quyền; hiệu lực theo `validFrom/validTo` | |
| F6 | Cấp grant **hết hạn** (validTo = quá khứ) | Tài khoản **mất** quyền ngay (V3.1) — không còn hiệu lực | |
| F7 | Đổi đơn vị của cán bộ | Quyền phạm vi **tự cập nhật** theo đơn vị mới (token cũ không giữ phạm vi cũ) | |
| F8 | Giao diện `/admin/permissions` trên điện thoại | Không tràn ngang, bảng cuộn được, nút bấm đủ lớn | |

## G. DỌN DẺP SAU UAT

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| G1 | Xoá các đầu việc `[UAT]` đã tạo | Xoá được; không còn dữ liệu thử | |
| G2 | Xoá nhật ký tác nghiệp `[UAT]` | Xoá được | |
| G3 | Kiểm tra bảng đếm (so với số liệu trước UAT) | `personal_work_items`, `routine_entries`, `monthly_work_results` về đúng số liệu ban đầu (chỉ `audit_events`/`notifications` tăng — đúng dấu vết) | |
| G4 | Báo cáo lỗi phát hiện (nếu có) | Kèm ảnh chụp + bước + thời điểm | |

---

## Phụ lục — đường dẫn nhanh

| Màn hình | Đường dẫn |
|---|---|
| Đăng nhập | `/login` |
| Nhật ký công việc | `/my-work` |
| Nhật ký tác nghiệp (F18/F19) | `/routine` |
| Xác nhận công việc (lãnh đạo) | `/work-item-reviews` |
| Kết quả tháng / báo cáo | `/reports` · `/monthly-results` |
| Trung tâm phân quyền | `/admin/permissions` |
| Tuyến phê duyệt | `/admin/supervisions` |
| Health (kiểm tra SHA) | `/api/health` → `{"commit":"…"}` |
