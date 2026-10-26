# Dashboard V4 dạng lưới widget — 26/10/2026

## Production

- **Code:** `8cdf86f`
- **Deployment:** `dpl_6acGjzEdKyU6aicP7vgAQFNEgBfG`
- **URL:** `https://task-cus.vercel.app/dashboard/v4`
- **Health:** `db=up`, `commit=8cdf86f`
- **Migration:** không có.

## Thay đổi

Dashboard V4 không còn bảng chi tiết lớn. Đã chuyển sang lưới widget nhỏ:

### 1. Số liệu giao ban — widget theo nhóm

- Mỗi chỉ tiêu là một widget nhỏ.
- Widget gồm:
  - Tên chỉ tiêu, mã, đơn vị.
  - Giá trị kỳ đang chọn, rút gọn theo tỷ/triệu.
  - Trạng thái Đã nhập / Đã xác nhận / Đã chốt.
  - 4 thanh mini cho Ngày / Tuần / Tháng / Năm.
- Chia theo nhóm chỉ tiêu.
- Tab **Tổng quan** hiển thị tối đa 12 widget ưu tiên.
- Tab **Chỉ tiêu** hiển thị toàn bộ widget.
- Có link **Mở toàn bộ** sang `/giao-ban`.

### 2. So sánh kết quả thu NSNN — widget

- 3 widget chỉ tiêu giao: BTC, UBND, KH tháng.
- 2 widget so sánh kỳ: tháng trước, cùng kỳ năm trước.
- Không còn bảng rộng, không còn cột Nguồn / Kỳ, không còn đoạn công thức.

### 3. Thứ tự ưu tiên

1. Số liệu giao ban (widget).
2. So sánh thu NSNN (widget).
3. Biểu đồ so sánh + tiến độ.
4. KPI, nhiệm vụ, cảnh báo, biểu đồ công việc.

## Phạm vi

- Dashboard V4: dùng lưới widget.
- Trang `/dashboard` cũ: giữ bảng chi tiết để đối chiếu, không thay đổi trong đợt này.
- `/giao-ban`: giữ bảng chi tiết, dùng widget so sánh.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-dashboard-v4.ts` | 18/18 PASS |
| `scripts/test-period-cumulative.ts` | 10/10 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |

## Lưu ý

- Giá trị gốc vẫn xem được khi rê chuột vào widget.
- Tỷ lệ target vẫn cao do 3 target Production thiếu 3 số 0; chưa tự sửa khi chưa xác nhận nguồn.
