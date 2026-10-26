# V5 Preview — shadcn/ui + màu Hải quan — 26/10/2026

## Production

- **Code:** `5bd0daa`
- **Deployment:** `dpl_6PCgGykqp5VMgJ7A9YEHECo8SwZj`
- **V5 URL:** `https://task-cus.vercel.app/v5`
- **Health:** `db=up`, `commit=5bd0daa`
- **Migration:** không có.

## Giao diện

Làm mới theo hướng **shadcnblocks Admin Kit**, nền trắng chủ đạo:

- Sidebar trắng, border phải.
- Topbar trắng, border dưới.
- Nền trang `#F7F8FA`.
- Card trắng, viền `#E5E7EB`, shadow rất nhẹ.
- Tab gạch chân, button shadcn, badge trạng thái.
- Bố cục gọn, mật độ dữ liệu cao nhưng thoáng.

### Màu Hải quan

| Màu | Mã | Dùng |
|---|---|---|
| Navy Blue | `#1B3461` | Button chính, tab active, link |
| Red | `#C62222` | Quá hạn, lỗi, cảnh báo nặng |
| Gold | `#F2C41D` | Điểm nhấn, cảnh báo, trạng thái chờ |
| Trắng | `#FFFFFF` | Sidebar, topbar, card |
| Nền | `#F7F8FA` | Nền trang |

Gold dùng nền `#FFF8DC`, chữ `#6B4E00` để đảm bảo tương phản.

## Thành phần

- shadcn-style Button (CVA + Radix Slot)
- Card / Badge / Progress
- V5 shell:
  - logo Hải quan
  - sidebar nhóm Tổng quan / Nghiệp vụ / Hệ thống
  - topbar tìm kiếm, thông báo, cấu hình, avatar
  - breadcrumb/tab/button theo shadcn

## Dashboard V5

- **Bảng “Tổng hợp số thu ngày” đặt trên cùng**, ngay dưới tab:
  - 5 mốc chỉ tiêu/so sánh.
  - Bảng Ô tô / Than cốc / Hàng hóa khác / Tổng cộng.
  - Cột: phát sinh ngày, lũy kế tháng, lượng xe, SL xe năm, trị giá USD, tổng thuế năm.
  - Dòng “Đã mở TK chưa nộp thuế” nếu có dữ liệu.
- 4 KPI widget.
- Hero Thu NSNN.
- Tiến độ điều hành.
- Lưới widget Số liệu giao ban.
- Cảnh báo + tải công việc.
- Cảnh báo target >300% thay vì hiện tỷ lệ sai.

## Phạm vi

- `/v5` là preview song song.
- Trang cũ `/dashboard`, `/dashboard/v4`, `/giao-ban` vẫn hoạt động.
- Chưa migrate toàn bộ app.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-v5-preview.ts` | 16/16 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |

## Tiếp theo

1. Anh duyệt V5 trên `/v5`.
2. Migrate Giao ban.
3. Công việc / Kế hoạch.
4. Báo cáo / Cấu hình.
5. Cutover khi ổn định.
