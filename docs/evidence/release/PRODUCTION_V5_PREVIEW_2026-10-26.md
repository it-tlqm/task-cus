# V5 Preview — Design system mới — 26/10/2026

## Production

- **Code:** `734cc03`
- **Deployment:** `dpl_F2YaxACFcmxnngG9xfRVY5zXtfNS`
- **V5 URL:** `https://task-cus.vercel.app/v5`
- **Health:** `db=up`, `commit=734cc03`
- **Migration:** không có.

## Định hướng

Làm mới giao diện theo **shadcn/ui + Tailwind**, hướng government data workspace:

- Nền giấy ấm, sidebar tối, accent teal.
- Widget nhỏ, không bảng dài trên dashboard.
- Typography rõ, số liệu tabular.
- Dữ liệu thật từ API hiện có; không đổi nghiệp vụ.

## Đã dựng

### Foundation

- Token V5 trong `tailwind.config.ts`.
- `cn()` tại `src/lib/utils.ts`.
- shadcn-style primitives:
  - Button (CVA + Radix Slot)
  - Card
  - Badge
  - Progress
- V5 shell riêng: sidebar, topbar, nav, user, preview badge.
- AppShell cũ tự bỏ qua với route `/v5`.

### V5 Dashboard

- 4 KPI widget.
- Hero Thu NSNN: số lớn, target, 4 mốc so sánh.
- Tiến độ điều hành: progress + trạng thái công việc.
- Số liệu giao ban: lưới widget theo chỉ tiêu, mini trend tuần/tháng/năm.
- Cảnh báo cần xử lý.
- Tải công việc theo bộ phận.
- Cảnh báo target bất thường (>300%) thay vì hiển thị tỷ lệ sai.

### Điểm vào

- Trực tiếp: `/v5`.
- Từ Dashboard cũ: nút **V5 Preview**.
- Từ Dashboard V4: nút **V5 Preview**.

## Phạm vi

Đợt này mới là **foundation + dashboard preview**.

Chưa migrate:

- Giao ban
- Công việc
- Kế hoạch
- Báo cáo
- Cấu hình
- Các trang quản trị

Trang cũ vẫn hoạt động bình thường; V5 chưa phải giao diện mặc định.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-v5-preview.ts` | 14/14 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |

## Bước tiếp theo

1. Anh duyệt hướng V5 trên `/v5`.
2. Migrate **Giao ban** sang V5.
3. Migrate **Công việc / Kế hoạch**.
4. Migrate **Báo cáo / Cấu hình**.
5. Cutover khi V5 ổn định; giữ route cũ để rollback.
