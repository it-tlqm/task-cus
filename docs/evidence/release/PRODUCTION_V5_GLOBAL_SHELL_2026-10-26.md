# V5 toàn bộ khung giao diện — 26/10/2026

## Production

- **Code:** `d3bf8d3`
- **Deployment:** `dpl_BRGszWwEQvF2D8VW3TXZbQ5kBhu6`
- **Health:** `db=up`, `commit=d3bf8d3`
- **Migration:** không có.

## Phạm vi đã áp dụng

### 1. V5 shell toàn cục

- `AppShell` cũ được thay bằng **V5Shell** cho toàn bộ màn hình nghiệp vụ.
- Sidebar trắng, topbar trắng, nav nhóm:
  - Điều hành
  - Công việc
  - Lịch & báo cáo
  - Hệ thống
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

### 3. Trang V5 đã tối ưu

- `/v5` — dashboard widget.
- `/v5/giao-ban` — ưu tiên bảng Tổng hợp số thu ngày + bảng theo chỉ tiêu.

## Chưa làm

Đây là **migration khung + theme toàn bộ**, chưa phải rewrite UX từng trang.

Các trang sau vẫn dùng layout cũ trong khung V5:

- Nhập số liệu (`/giao-ban/nhap`)
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
| `scripts/test-v5-preview.ts` | 18/18 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |
| `/tasks` dưới V5 shell | PASS (local) |

## Ưu tiên tiếp theo

1. **Nhập số liệu** — inbox việc cần nhập + form 2 cột + lũy kế inline.
2. **Công việc** — bảng/kanban, filter, chi tiết.
3. **Kế hoạch / Duyệt hồ sơ**.
4. **Báo cáo / Quản trị**.
5. Login V5.
