# TALUNG-CUS-WORK — CẨM NANG ĐIỀU HÀNH DÀNH CHO LÃNH ĐẠO CHI CỤC & TRƯỞNG BỘ PHẬN
*(Quy trình Trực ban điều hành, Phê duyệt kế hoạch tuần & Xuất báo cáo giao ban)*

---

## 1. DÀNH CHO TRƯỞNG / PHÓ CÁC ĐỘI NGHIỆP VỤ

### BƯỚC 1: LẬP VÀ PHÂN RÃ KẾ HOẠCH TUẦN ([`/plans`](file:///d:/thanhnx/OpenCode/talung-cus-work/src/app/plans/page.tsx))
1. Vào mục **"Kế hoạch công tác"** trên thanh điều hướng bên trái.
2. Bấm **"+ Thêm đầu việc kế hoạch"**:
   - Chọn hoạt động nghiệp vụ mẫu (hệ thống tự động gợi ý từ danh mục chuẩn 48 mẫu).
   - Tự do chỉnh sửa tiêu đề công việc theo thực tế của Đội (không bị ép buộc checklist cứng).
   - Phân công **Cán bộ chủ trì** và **Cán bộ phối hợp**.
   - Thiết lập thời hạn chót hoàn thành (`Deadline`).
3. Sau khi hoàn tất danh mục công việc của tuần, bấm nút **"Trình Lãnh đạo phê duyệt"**.
   - Kế hoạch chuyển từ trạng thái `DRAFT` $\rightarrow$ `SUBMITTED`.

### BƯỚC 2: THEO DÕI TIẾN ĐỘ & PHÊ DUYỆT GIA HẠN
1. Theo dõi biểu đồ tiến độ hoàn thành của các cán bộ trong đội tại bảng điều khiển.
2. Khi cán bộ gửi đề xuất lùi hạn chót:
   - Vào mục **"Phê duyệt điều hành"** ([`/approvals`](file:///d:/thanhnx/OpenCode/talung-cus-work/src/app/approvals/page.tsx)).
   - Xem lý do giải trình $\rightarrow$ Bấm **"Chấp thuận gia hạn"** hoặc **"Yêu cầu giải trình thêm"**.

---

## 2. DÀNH CHO BAN LÃNH ĐẠO CHI CỤC (CHI CỤC TRƯỞNG & PHÓ CHI CỤC TRƯỞNG)

### BƯỚC 1: TRỰC BAN ĐIỀU HÀNH TỔNG THỂ ([`/dashboard`](file:///d:/thanhnx/OpenCode/talung-cus-work/src/app/dashboard/page.tsx))
- Nắm bắt tức thì 6 chỉ số KPI nghiệp vụ cốt lõi:
  - Tổng số nhiệm vụ lũy kế trong kỳ.
  - Số nhiệm vụ đang triển khai đúng hạn.
  - Số nhiệm vụ cán bộ đã làm xong đang chờ nghiệm thu (`WAITING_REVIEW`).
  - Số nhiệm vụ quá hạn nghiệp vụ cần đôn đốc.
  - Số vụ việc phát sinh vướng mắc / cảnh báo đỏ.

### BƯỚC 2: GIAO NHIỆM VỤ ĐỘT XUẤT 1-CHẠM ([`/tasks`](file:///d:/thanhnx/OpenCode/talung-cus-work/src/app/tasks/page.tsx))
- Khi có chỉ đạo khẩn từ Cục Hải quan hoặc phát sinh vụ việc tại luồng cửa khẩu:
  - Bấm nút **"+ Giao nhiệm vụ đột xuất"** ngay trên thanh công cụ đầu Dashboard.
  - Chọn Đội nghiệp vụ thụ lý $\rightarrow$ Nhập nội dung chỉ đạo $\rightarrow$ Đặt hạn chót $\rightarrow$ Bấm **"Giao việc"**.
  - Cán bộ và Đội trưởng sẽ nhận được thông báo chuông tức thời trên thiết bị di động.

### BƯỚC 3: PHÊ DUYỆT HOẶC TRẢ LẠI KẾ HOẠCH TUẦN
- Vào xem kế hoạch tuần của các Đội:
  - Nếu đồng ý: Bấm **"Phê duyệt ban hành kế hoạch"** (`APPROVED`).
  - Nếu cần bổ sung: Bấm **"Yêu cầu chỉnh sửa (Trả lại)"** $\rightarrow$ Nhập ghi chú chỉ đạo. Kế hoạch chuyển về `RETURNED` để Đội trưởng cập nhật lại.

### BƯỚC 4: XUẤT BÁO CÁO GIAO BAN (.XLSX) ([`/reports`](file:///d:/thanhnx/OpenCode/talung-cus-work/src/app/reports/page.tsx))
1. Chọn kỳ báo cáo cần xuất (Tuần hiện tại / Tháng / Quý).
2. Tải về 2 định dạng chuẩn:
   - **Mẫu A (Kế hoạch tuần gốc — 8 cột):** Đúng nguyên văn biểu mẫu Kế hoạch công tác truyền thống của Chi cục, tự động gom theo 5 nhóm nghiệp vụ.
   - **Mẫu B (Báo cáo chi tiết đầu việc — 13 cột):** Phân rã tiến độ, cán bộ chủ trì, người phối hợp và mã số định danh từng nhiệm vụ.
3. Khi kết thúc kỳ: Bấm nút **"Chốt số liệu kỳ này"** $\rightarrow$ Hệ thống sẽ niêm phong toàn bộ dữ liệu và sinh mã băm SHA-256 chống sửa đổi phục vụ công tác thanh tra, kiểm tra.

---
*Hệ thống được thiết kế theo tiêu chuẩn công tác nghiệp vụ của Tổng cục Hải quan.*
