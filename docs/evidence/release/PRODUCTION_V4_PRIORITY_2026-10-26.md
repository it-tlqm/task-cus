# V4 — Ưu tiên Số liệu giao ban và So sánh — 26/10/2026

## Production

- **Code:** `da04c07`
- **Deployment:** `dpl_EpQAYfoFVCUXeeoA3uiBtj4dADcs`
- **URL:** `https://task-cus.vercel.app/dashboard/v4`
- **Health:** `db=up`, `commit=da04c07`
- **Migration:** không có.

## Thay đổi

Trong Dashboard V4, thứ tự nội dung được đưa về ưu tiên:

1. **Số liệu giao ban** — bảng chi tiết (đổi tên từ “Số liệu chi tiết”).
2. **So sánh kết quả thu NSNN** — bảng so sánh đầy đủ.
3. **Biểu đồ so sánh + tiến độ chỉ tiêu**.
4. Các thẻ KPI, nhiệm vụ, cảnh báo, biểu đồ còn lại xuống dưới.

Áp dụng cho:

- Tab **Tổng quan**: bảng + so sánh lên đầu, KPI và biểu đồ xuống dưới.
- Tab **Bảng**: bảng chi tiết + bảng so sánh.
- Tab **So sánh**: bảng chi tiết + bảng so sánh, sau đó biểu đồ so sánh.
- Tab **Biểu đồ**: giữ biểu đồ so sánh và các biểu đồ công việc.

Bảng điều hành cũ (`/dashboard`) vốn đã đặt “Số liệu giao ban” + “So sánh” ngay dưới bộ lọc; lần này không thay đổi để tránh ảnh hưởng.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-dashboard-v4.ts` | 16/16 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |
