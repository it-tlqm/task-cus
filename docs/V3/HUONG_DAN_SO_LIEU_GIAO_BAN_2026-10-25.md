# HƯỚNG DẪN VẬN HÀNH SỐ LIỆU GIAO BAN (25/10/2026)

Tài liệu dành cho lãnh đạo, trưởng bộ phận và công chức nhập số liệu.

## 1. Các màn hình chính

| Màn hình | Đường dẫn | Dùng để |
|---|---|---|
| Số liệu giao ban | `/giao-ban` | Xem tổng hợp ngày/tuần/tháng/năm, chỉ tiêu, trạng thái |
| Nhập số liệu giao ban | `/giao-ban/nhap` | Nhập số thực tế theo ngày |
| Cấu hình số liệu giao ban | `/giao-ban/cau-hinh` | Cấu hình chỉ tiêu, chỉ tiêu giao, mốc lũy kế, phân công |
| Báo cáo giao ban | `/giao-ban/bao-cao` | Báo cáo/đối chiếu |
| Bảng điều hành V4 | `/dashboard/v4` | Xem KPI và biểu đồ |

## 2. Cấu hình lần đầu / đầu kỳ

Vào **Số liệu giao ban → Cấu hình số liệu giao ban**.

### 2.1. Nhóm & chỉ tiêu
- Kiểm tra chỉ tiêu `THU_NSNN` đang hoạt động.
- Không xóa chỉ tiêu đã có dữ liệu.
- Chỉ thêm chỉ tiêu mới khi đã chốt mã, đơn vị tính, cách tính.

### 2.2. Phân công nhập
- Chọn người được nhập từng chỉ tiêu.
- Không có phân công thì công chức không thấy ô nhập.
- Có thể phân công theo nhóm hoặc theo chỉ tiêu.

### 2.3. Chỉ tiêu giao — dùng cho các dòng BTC / UBND / KH tháng
Vào tab **Chỉ tiêu giao**:
1. Chọn `THU_NSNN`.
2. Thêm dòng:
   - `BTC` — Chỉ tiêu Bộ Tài chính (năm)
   - `UBND` — Chỉ tiêu UBND tỉnh (năm)
   - `KH_THANG` — Kế hoạch tháng HQTL
3. Nhập giá trị, kỳ, nguồn `REAL`.
4. Lưu → **Xác nhận**.

> Chỉ tiêu phải ở trạng thái **Đã xác nhận/Đã chốt** và có quy tắc D5-A thì mới tính % chính thức.

### 2.4. Mốc lũy kế
- Dùng khi cần số dư đầu kỳ cho chỉ tiêu BALANCE.
- Không nhập số lũy kế năm vào ô phát sinh ngày.

## 3. Nhập số liệu thực tế hàng ngày

Vào **Số liệu giao ban → Nhập số liệu giao ban**.

1. Chọn đúng ngày.
2. Chỉ các chỉ tiêu được phân công mới hiện.
3. Nhập **giá trị thực tế phát sinh trong ngày**.
4. Bấm **Lưu số liệu**.
5. Nếu chỉ tiêu có nhãn **CẦN KIỂM TRA**:
   - Người nhập bấm **Gửi kiểm tra** → trạng thái `SUBMITTED`.
   - Lãnh đạo/người được phân công xác nhận bấm **Xác nhận** → `CONFIRMED`.
6. Nếu sai: người xác nhận bấm **Cần điều chỉnh**, nhập lý do; người nhập sửa lại.

### Trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| Chưa nhập | Chưa có bản ghi |
| DRAFT | Đã lưu, chờ gửi kiểm tra |
| RECORDED | Đã ghi nhận, không cần kiểm tra |
| SUBMITTED | Đã gửi, chờ xác nhận |
| CONFIRMED | Đã xác nhận |
| NEEDS_FIX | Bị yêu cầu điều chỉnh |
| LOCKED | Kỳ/báo cáo đã khóa, không sửa |

## 4. Đọc bảng So sánh kết quả thu NSNN

- **Chưa cấu hình**: chưa có target BTC/UBND/KH tháng → nhập ở mục 2.3.
- **Chưa có dữ liệu đối chiếu**: chưa có số thực tế của tháng trước/cùng kỳ → phải nhập số liệu thực tế các kỳ đó, không phải target.
- **Chưa xác định**: thiếu dữ liệu hoặc mẫu số bằng 0.
- **Chưa đủ kỳ**: tháng hiện tại chưa hết; B1-A chỉ so cùng số ngày đến data cutoff.

### Nút mới
Trong khối so sánh có nút **“Nhập chỉ tiêu đối chiếu”**:
- mở đúng tab **Chỉ tiêu giao**,
- chọn sẵn `THU_NSNN`.

Nút chỉ hiện với tài khoản có quyền `metrics.config`.

## 5. Quyền

| Quyền | Dùng để |
|---|---|
| `metrics.config` | Cấu hình chỉ tiêu, target, baseline, phân công |
| `metrics.entry` / phân công | Nhập số liệu ngày |
| `metrics.confirm` | Xác nhận số liệu |
| `metrics.export` | Xuất báo cáo |
| `metrics.lock` | Chốt số liệu |

Nếu không thấy ô/nút: kiểm tra phân công nhập và quyền tài khoản.

## 6. Lưu ý nghiệp vụ

- Không nhập lũy kế năm vào ô phát sinh ngày.
- Không dùng số DEMO để tính % chính thức.
- Không sửa số đã `CONFIRMED` nếu không có quyền; dùng **Cần điều chỉnh**.
- Số liệu tháng trước/cùng kỳ lấy từ bản ghi thực tế, không lấy từ target.
- Kỳ đã khóa thì phải mở khóa theo quy trình, không sửa trực tiếp.

## 7. Quy trình tháng

1. Đầu tháng: cấu hình target BTC/UBND/KH tháng.
2. Hàng ngày: nhập số thực tế.
3. Cuối ngày/tuần: gửi kiểm tra → xác nhận.
4. Cuối tháng: đối chiếu bảng so sánh, xử lý `NEEDS_FIX`.
5. Chốt báo cáo/snapshot khi đủ dữ liệu.

## 8. Hỗ trợ

Nếu bảng vẫn “Chưa cấu hình” sau khi đã nhập target:
- kiểm tra target đúng kỳ/năm,
- đúng `THU_NSNN`,
- nguồn `REAL`,
- trạng thái đã xác nhận/chốt,
- quy tắc D5-A đã duyệt.
