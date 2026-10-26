# V5 toàn bộ khung giao diện — 26/10/2026

## Production

- **Code:** `54b4a70`
- **Deployment:** `dpl_Ers44M3Z9GaXhaFiwqpZoG6m3TRR`
- **Health:** `db=up`, `commit=54b4a70`
- **Migration:** không có.

## Phạm vi đã áp dụng

### 1. V5 shell toàn cục

- `AppShell` cũ được thay bằng **V5Shell** cho toàn bộ màn hình nghiệp vụ.
- Sidebar trắng, topbar trắng, nav nhóm đầy đủ:
  - Điều hành
  - Công việc
  - Lịch & báo cáo
  - Quản trị
  - Hỗ trợ
- Sidebar có đủ mục nghiệp vụ và quản trị, không còn ít mục.
- **Mobile: sidebar mở rộng dạng drawer**, có overlay, đóng khi chọn trang; không dùng tabbar ngang.
- Các trang cũ vẫn giữ nguyên logic/nghiệp vụ nhưng nằm trong khung V5.
- Login/change-password vẫn full-screen riêng.

### 2. Token toàn cục chuyển sang V5

Các token cũ (`primary`, `surface`, `border`, `status-*`…) được remap sang:

- Navy `#1B3461`
- Red `#C62222`
- Gold `#F2C41D`
- Nền trắng `#FFFFFF`, page `#F7F8FA`
- Viền `#E5E7EB`

Nhờ vậy các trang cũ tự chuyển sang nền trắng, chữ/nút navy, trạng thái đỏ/vàng xanh, không cần sửa từng class.

### 2b. Đồng bộ table & input toàn cục

- Table: header xám nhạt, chữ muted, viền dưới, hover row, font 12px.
- Input/select/textarea: cao tối thiểu 36px, border `#E5E7EB`, radius 8px, focus navy.
- Button: radius 8px, transition, focus ring navy.
- Placeholder màu muted; bảng và form thống nhất trên mọi trang cũ.

### 3. Trang V5 đã tối ưu

- `/v5` — dashboard widget.
- `/v5/giao-ban` — ưu tiên bảng Tổng hợp số thu ngày + bảng theo chỉ tiêu.
- `/v5/giao-ban/nhap` — nhập số liệu:
  - Tab kỳ Ngày/Tuần/Tháng/Quý/Năm.
  - Danh sách “Cần nhập” và “Tất cả”.
  - Form theo card, tiến độ nhập.
  - Tính lũy kế inline, không cần modal rời.
  - Lưu nháp/thay đổi, cảnh báo trạng thái.
- Tab nhỏ trên V5 có hành vi thật:
  - Dashboard: Tổng quan / Số liệu / Công việc / Báo cáo.
  - Giao ban: Tổng hợp / Theo chỉ tiêu / So sánh / Nhận xét.
- Bổ sung biểu đồ:
  - So sánh kỳ này, tháng trước, cùng kỳ, chỉ tiêu.
  - Thu theo phân loại tháng/năm.
- Màu chỉ tiêu:
  - Đạt/vượt: xanh.
  - Chưa đạt/chưa nhập: đỏ.
  - Target bất thường: vàng gold + cảnh báo.
- Giảm padding/margin thừa; content rộng hơn (`max-w 1760`).
- Sidebar section thu gọn/mở rộng; mobile dùng drawer.

## Chưa làm

Các trang sau vẫn dùng layout cũ trong khung V5:

- Công việc (`/tasks`)
- Kế hoạch (`/plans`)
- Duyệt hồ sơ (`/approvals`)
- Công chức nhận việc (`/my-work`)
- Nhật ký ca trực (`/routine`)
- Báo cáo / quản trị

Bước tiếp theo là tối ưu UX từng màn hình theo thứ tự ưu tiên.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-v5-preview.ts` | 24/24 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |
| `/tasks` dưới V5 shell | PASS (local) |

## Ưu tiên tiếp theo

1. **Công việc** — bảng/kanban, filter, chi tiết.
2. **Kế hoạch / Duyệt hồ sơ**.
3. **Báo cáo / Quản trị**.
4. **Báo cáo / Quản trị**.
5. Login V5.
