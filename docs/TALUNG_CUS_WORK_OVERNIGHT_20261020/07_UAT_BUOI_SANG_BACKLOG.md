# 07 — CHECKLIST UAT BUỔI SÁNG + BACKLOG CHƯA TRIỂN KHAI

## A. UAT sáng hôm sau (người phụ trách dự án / Hải quan)

Chỉ kiểm thử được những mục Agent báo `DEPLOYED_AUTO_VERIFIED` hoặc `DRAFT_PREVIEW_ONLY`, không mặc định mọi YC đều hoàn thành.

- [ ] Truy cập `https://task-cus.vercel.app/`, đăng nhập cán bộ demo, lãnh đạo demo; xác minh phiên bản/health do Agent báo.
- [ ] Nhật ký công việc vẫn xem được danh mục 348 TX, mã NV/CBL/TH..., tìm kiếm; hệ số 0 khác để trống; 48 mẫu cũ không bị mất lịch sử.
- [ ] Tạo công việc demo từ đầu việc TX, hạn xử lý, ngày hoàn thành, minh chứng; một bản ghi xuất hiện đúng các góc nhìn, không tạo trùng.
- [ ] Thử công việc Ban lãnh đạo giao: giao trực tiếp cho người, giao bộ phận có một đầu mối chủ trì, người phối hợp; chỉ test nếu Agent đã triển khai phạm vi liên quan, không tự gộp form.
- [ ] Bấm nút Chấp thuận: phải mở nội dung để xem, **không tự phê duyệt**; đồng ý/từ chối/yêu cầu giải trình theo đúng quyền.
- [ ] Cán bộ không xem/duyệt hồ sơ ngoài quyền; minh chứng chỉ tải qua endpoint có quyền.
- [ ] YC-33: xem kết quả công việc, nguồn sản phẩm QĐ1277, hệ số, cách tính và lý do thiếu điểm; không hiển thị điểm tính nhầm bằng 0.
- [ ] YC-36: điểm gợi ý có thể sửa, ưu điểm/hạn chế, nhận xét lãnh đạo mặc định trống; phân biệt tự chấm với người có thẩm quyền.
- [ ] 01A/01B **tháng**, 02A/02B **quý**; xem trước và tải file (nếu sẵn); mở Excel, kiểm tra dấu tiếng Việt, in, dòng dài, khoảng chữ ký.
- [ ] YC-35: chỉ lấy bình quân đúng người phụ trách đã xác nhận theo kỳ; chưa biết quan hệ thì hiện cảnh báo, không tự tính.
- [ ] Dữ liệu thực của cán bộ khác không bị thay đổi; nếu test Production, dùng dữ liệu thử được phép và không xóa audit.

### Mẫu báo lỗi gửi lại OpenCode

```
YC:
Đường dẫn / màn hình:
Vai trò tài khoản thử:
Kỳ / dữ liệu thử:
Bước thao tác:
Kết quả mong đợi:
Kết quả thực tế:
Ảnh/video (nếu có):
Mức ảnh hưởng: P0 / P1 / P2:
```

## B. Việc cần Hải quan xác nhận sau khi nhận bản chạy

1. **Công thức YC-33:** hệ số TX có tham gia điểm như thế nào so với hệ số QĐ1277; tính số lượng, tiến độ, chất lượng; rounding; ngoại lệ.
2. **Điểm quý:** tổng hợp theo kỳ như thế nào; mẫu 01A/01B và 02A/02B quan hệ ra sao.
3. **Quan hệ lãnh đạo:** Đội trưởng, hai Đội phó và tập cán bộ từng người phụ trách theo kỳ; điểm thành phần nào lấy bình quân.
4. **Xếp loại:** điều kiện, giới hạn, phê duyệt/xử lý ngoại lệ; không chỉ dựa điểm KPI.
5. **Nhân sự/bộ phận:** tên ngắn còn mơ hồ, cơ cấu Tổng hợp/CBL/Nghiệp vụ, HĐLĐ111 và ánh xạ TX cho đúng quyền.
6. **Mẫu xuất:** biến thể biểu mới nhất, mẫu chữ ký, trường trống, phạm vi đơn vị, bản in trình ký.

## C. Backlog riêng — chưa cho Agent tự triển khai

### B1. Thống nhất cách tạo/ghi nhận công việc

- Ý tưởng đã được ghi nhận, **chưa được phép code**: một công việc gốc, form chung linh hoạt, nhiều cách xem (nhật ký/plan/task/results).
- Phải audit đường dữ liệu thật trước khi đổi schema; có thể có nhiều nguồn (TX, công việc lãnh đạo giao, đột xuất) và nhiều trạng thái, không ép tất cả vào một form vô điều kiện.
- TX là **đầu việc**; QĐ1277 là **sản phẩm/kết quả đầu ra**. Không trộn danh mục.

### B2. Sổ phân công nhiệm vụ theo ngày

- File `so phan cong nhiem vu(1).xls` là biểu vị trí trực/giám sát/nghiệp vụ theo ngày.
- Đây không phải mặc nhiên công việc đã hoàn thành hoặc một sản phẩm được tính điểm.
- Có thể liên kết ca/lịch với nhật ký khi Hải quan chốt phạm vi; không tự thay thế Lịch trực hiện tại.

### B3. Báo cáo cấp đơn vị 2C/2D/2E

- 2C: báo cáo các lĩnh vực công tác của **đơn vị** (văn bản, số thu NSNN, xử lý hồ sơ, chống buôn lậu, KTSTQ, trang thiết bị...).
- 2D: tổng hợp đánh giá/xếp loại của nhiều người.
- 2E: chỉ tiêu kế hoạch trọng tâm theo quý và lũy kế (nguồn độc lập, có thể nhập/tích hợp).
- **Không nhầm 2C báo cáo đơn vị với Mẫu 02C kế hoạch tháng cá nhân**.
- Khi có YC chính thức: khảo sát API/số liệu Giao ban/Dashboard đang có và nguồn chuẩn; không tự điền số từ nhật ký cá nhân.

### B4. Bucket public cũ

- `task-attachments` còn policy public theo báo cáo trước; cần đợt remediation riêng, private migration + rollback + permission test. Không làm trong YC-33→37 đêm nay.
