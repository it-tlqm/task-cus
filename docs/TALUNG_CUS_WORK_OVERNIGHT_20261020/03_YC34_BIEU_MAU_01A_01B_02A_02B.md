# 03 — YC-34: BIỂU MẪU THÁNG/QUÝ VÀ XUẤT HỒ SƠ

## 1. Phân biệt mẫu, kỳ, đối tượng

| Mẫu | Mục đích | Kỳ | Đối tượng | Nguồn tham khảo trong `Dữ liệu.zip` |
|---|---|---|---|---|
| 01A | Phiếu theo dõi, đánh giá | **Tháng** | Công chức không giữ chức vụ lãnh đạo | Sheet `Biểu 01A (CC)` trong workbook công chức |
| 01B | Phiếu theo dõi, đánh giá | **Tháng** | Công chức giữ chức vụ lãnh đạo | Sheet `01B tháng 9` / `01B (LĐ)` |
| 02A | Phiếu đánh giá, xếp loại | **Quý** | Công chức không giữ chức vụ lãnh đạo | Sheet `Biểu 02A Quý III (CC)` hoặc tương đương |
| 02B | Phiếu đánh giá, xếp loại | **Quý** | Công chức giữ chức vụ lãnh đạo | Sheet `02B Quý III(LĐ)` hoặc tương đương |

**CẢNH BÁO:** `Mẫu 02C` trong các workbook là **kế hoạch công tác tháng cá nhân**; `Mẫu 2C Báo cáo KQ các lĩnh vực công tác của đơn vị.docx` là **báo cáo đơn vị**. Không nhầm hai đầu ra này.

## 2. Quy trình làm

1. Audit các exporter đã triển khai (Bảng 1/01A, 02C kế hoạch, Excel `legacy`/`detailed`). Không làm hỏng API, đường dẫn và file tải cũ.
2. Đọc mẫu gốc để lập bản đồ vùng (header, thông tin cá nhân, mục I/II/III, điểm, nhận xét, chữ ký, print area, merged cells, page setup, formulas, number formats). Xác định nhiều biến thể và chọn **mẫu có nguồn rõ ràng**.
3. Thiết kế định nghĩa biểu mẫu theo `form_type`, `evaluation_period`, `source_version`, `subject_id`, `role_at_period`, `snapshot_id`, `status`; không dùng file mẫu của một cá nhân làm template có sẵn tên/điểm cá nhân khác.
4. Bổ sung server-side service dữ liệu cho từng mẫu. Chỉ xuất điểm có căn cứ; phần thiếu để trống hoặc thể hiện rõ trong bản nháp; không tạo điểm 0 nếu thiếu.
5. UI xem trước: chọn cá nhân/kỳ hợp lệ, kiểm tra dữ liệu thiếu, xem trước nội dung, cảnh báo những trường cần cán bộ/lãnh đạo bổ sung.
6. Export `.xlsx` đúng bố cục và khả năng in; mẫu/dữ liệu thật không commit. Kiểm soát formula injection với văn bản do người dùng nhập.
7. Nếu PDF print đang có, chỉ dùng khi chất lượng đối chiếu thực sự đạt; không bắt buộc tự thêm công cụ mới trong một đêm.
8. Có thể hỗ trợ xuất **bản nháp rõ trạng thái** khi điểm chưa đủ; **không gắn 'đã trình ký', 'đã duyệt', 'chính thức'** cho hồ sơ chưa qua thẩm quyền.

## 3. Hành vi theo nghiệp vụ

- Tiêu chí chung gợi ý nhưng cán bộ có quyền sửa; kết quả tự chấm được lưu theo kỳ.
- Ưu điểm/hạn chế có chỗ nhập; nhận xét của người quản lý để trống mặc định, người được phân quyền có thể điền trên hệ thống hoặc để trống khi in.
- Một bản export lấy dữ liệu từ công việc gốc và snapshot đánh giá, không tạo công việc mới hoặc sửa điểm chỉ vì người dùng in lại.
- Chữ ký, ngày ký, cơ quan, chức vụ lấy từ cấu hình/kỳ thực tế nếu đã xác nhận, không hard-code thông tin cá nhân từ workbook mẫu.
- Biểu quý cần nguồn đánh giá **theo quý**, không mặc định lấy điểm trung bình ba biểu tháng.
- Số liệu của người/đơn vị khác phải bị chặn theo RBAC server; export lưu vết actor và kỳ.

## 4. Mức độ chính xác mẫu

- Kiểm tra số cột/dòng, merged ranges, header/section labels, dòng tổng, định dạng %, điểm, ngày tháng, vùng in, khổ giấy, tỷ lệ in, chữ ký và dấu tiếng Việt.
- Ít nhất một fixture đối chiếu ẩn danh cho **mỗi mẫu**. Khi mẫu khác nhau giữa workbook, ghi quyết định chọn phiên bản trong `FORM_TEMPLATE_PROVENANCE.md`.
- File Excel phải mở được trong Excel/LibreOffice của người dùng; trong CI/test kiểm tra cấu trúc OOXML, workbook không lỗi formula/invalid references, không có dữ liệu cá nhân của mẫu gốc.
- Khi Excel mẫu chứa công thức, không chép máy móc tham chiếu liên sheet có nguồn không tồn tại; hoặc dựng workbook đủ nguồn hợp lệ, hoặc thay bằng giá trị đã tính kèm provenance tùy quy tắc đã xác minh.

## 5. Test bắt buộc

- 01A tháng không mở dưới nhãn 02A quý; 01B/02B chỉ theo vai trò lịch sử kỳ tương ứng.
- Người A không export điểm người B nếu không có quyền, kể cả thay ID trên API.
- Không có điểm: preview/export draft với cảnh báo, không sinh điểm giả/chấm giả.
- File minh chứng không được đưa thành public URL trong workbook.
- In lại không làm đổi snapshot, không tạo thêm công việc.
- Kiểm thử 4 template, cả empty state, full data, dữ liệu nhiều dòng, chữ dài, tên dài, nội dung nhận xét nhiều dòng.

## 6. Đợt này không tự mở rộng sang

- **2C báo cáo các lĩnh vực của đơn vị**, **2D bảng tổng hợp xếp loại**, **2E chỉ tiêu kế hoạch trọng tâm**. Ghi bảng dữ liệu phụ thuộc và bản thiết kế chờ xác nhận; nếu phần nào chỉ là xuất từ dữ liệu đã tồn tại và mẫu có thể xác minh, báo cáo đề xuất riêng, không coi 2C/2D/2E thuộc YC-34 hiện tại.
- Mẫu `02C` kế hoạch tháng vốn đã có trên hệ thống phải giữ nguyên.

## 7. Hoàn thành

Báo trạng thái **riêng cho từng mẫu**: `READY_AUTO_VERIFIED`, `DRAFT_PREVIEW_ONLY`, `WAITING_DATA_OR_RULES`, `NOT_IMPLEMENTED`. Không gộp một kết luận “YC-34 xong” nếu còn biểu chưa xuất hợp lệ.
