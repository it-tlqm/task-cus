# Ghi chú bản nâng cấp V5 — 28/10/2026 (local, chưa deploy)

## 1. Báo cáo và chốt kỳ

- Đã kiểm tra xuất **Word báo cáo giao ban** bằng snapshot số liệu tháng 10:
  - `265.075.753.626` (tháng), `1.363.106.886.324` (năm)
  - `236.643.983,94` (USD), `604` / `4.398` (xe)
  - `355.053.814.006` + `3.095.562.726` = `358.149.376.732`
  - `132,54%`, `57,19%`, `-26,92%`
- Đã kiểm tra lưu/đọc/xóa **phiên bản báo cáo** trên CSDL local.
- Đã kiểm tra **chốt kỳ/khóa số liệu**: tạo snapshot, checksum SHA-256, khóa kỳ, ghi nhật ký, chặn chốt trùng, chặn quản trị kỹ thuật.
- Kết quả: `test-briefing-report-export.ts` 25/25, `test-report-lock-flow.ts` 12/12.

## 2. Hệ thống chỉ tiêu mở

- Giữ kiểu nhập **Số phát sinh / Lũy kế ngày** trong cấu hình chỉ tiêu.
- Nhập Excel cho **mọi chỉ tiêu được phân công**, có file mẫu và kiểm tra trước.
- Giữ cấu hình kỳ nhập, kiểu nhập, mốc mở đầu kỳ, phân loại và quy tắc so sánh trên giao diện.
- Tài liệu: `docs/OPEN_METRICS_INPUT_MODE.md`, `docs/METRIC_EXCEL_IMPORT.md`.
- Kết quả: `test-cumulative-mode.ts` 11/11, `test-metric-excel-import.ts` 23/23.

## 3. UX

### Công việc của tôi
- Một header, một bộ lọc thời gian, một cụm KPI, một nhật ký công việc dùng chung desktop/mobile.
- Mobile có thêm ô tìm kiếm và giữ nút Thêm việc/Nhật ký/Làm mới.
- Bảng desktop giữ chiều rộng tối thiểu, không bóp cột.

### Kế hoạch
- Thanh lọc dính khi cuộn.
- Gantt có mốc **hôm nay** và màu trạng thái.

### Báo cáo
- Bộ lọc desktop luôn hiện; mobile mở dạng **drawer** từ đáy màn hình.
- Bảng có header dính.
- Modal bản chụp có bảng **so sánh với số liệu hiện tại**.

### Chi tiết công việc
- Thanh điều hướng nhanh: Tiến độ, Phần việc, Nhật ký, Trao đổi, Tệp đính kèm.
- Giữ thanh thao tác cố định trên mobile.

### Quản trị
- Hồ sơ cán bộ hiển thị **phân công chính** ngay trong form.
- Cảnh báo và nút bổ sung khi chưa có phân công chính.
- Chặn xác nhận điều chuyển trùng đơn vị/chức vụ.

## 4. Kiểm thử

| Bộ test | Kết quả |
| --- | --- |
| V5 preview | 51/51 |
| UX phase 4 | 8/8 |
| UX phase 5 | 31/31 |
| Cumulative mode | 11/11 |
| Excel import | 23/23 |
| Briefing report export | 25/25 |
| Report lock flow | 12/12 |
| Encoding | PASS |
| `tsc --noEmit` | PASS |
| `pnpm build` | PASS |

## 5. Chưa làm / cần nghiệm thu

- **Chưa deploy Production.** Production vẫn ở `dpl_5UwoUvCFVXqCyZVF59fBeRCxK1gj`.
- Chưa chốt kỳ tháng 10 trên Production; cần người có thẩm quyền bấm chốt sau khi nghiệm thu.
- Chưa xuất Word/Excel từ dữ liệu Production thật; mới kiểm tra bằng snapshot và CSDL local.
- Các màn hình Nhật ký ca trực, Thông báo, Đăng nhập, Đổi mật khẩu đã dùng token V5 nhưng chưa refactor sâu cấu trúc.
- Modal Quản trị đã dùng token V5; chưa đồng bộ thành một bộ dialog dùng chung.
