# V5 Design System — Hải quan Tà Lùng

## Mục tiêu

Làm mới giao diện theo **shadcn/ui + Tailwind**, hướng **government data workspace**:

- Dữ liệu dày nhưng vẫn thoáng.
- Widget nhỏ, phân cấp rõ, không bảng tràn màn hình.
- Màu ấm, tương phản cao, ít nhiễu thị giác.
- Giữ nguyên nghiệp vụ/API/DB; chỉ thay lớp trình bày.

## Phạm vi

- **V5 preview song song**: `/v5`.
- Không thay production mặc định.
- Trang cũ `/dashboard`, `/giao-ban` vẫn hoạt động.
- AppShell cũ được bỏ qua khi vào `/v5`; V5 có shell riêng.

## Token

### Primitive → Semantic → Component

| Semantic | Giá trị | Dùng cho |
|---|---|---|
| `v5-bg` | `#F4F1EA` | Nền giấy ấm |
| `v5-surface` | `#FFFDF8` | Card, panel |
| `v5-ink` | `#17211C` | Chữ chính |
| `v5-muted` | `#66706A` | Chữ phụ |
| `v5-line` | `#DDD8CC` | Viền, divider |
| `v5-accent` | `#0E6B5C` | Hành động chính, dữ liệu nhấn |
| `v5-accent-soft` | `#E3F0EC` | Nền nhấn nhẹ |
| `v5-sidebar` | `#15211C` | Sidebar tối |
| `v5-warning` | `#B45309` | Cảnh báo |
| `v5-danger` | `#B42318` | Lỗi, quá hạn |
| `v5-success` | `#067647` | Hoàn thành, đã chốt |

Quy tắc:

- Không dùng hex trực tiếp trong component V5.
- Dùng token Tailwind `bg-v5-surface`, `text-v5-ink`, `border-v5-line`…
- Trạng thái dùng cặp `*-soft` + màu chữ tương ứng.

## Typography

- Font: **Inter** (đã có, hỗ trợ tiếng Việt).
- Số liệu: `tabular-nums`, weight 600–700.
- Tiêu đề trang: 24px / 700.
- Tiêu đề widget: 12–14px / 600.
- Nhãn nhỏ: 9–11px, uppercase có chọn lọc.
- Không dùng quá 3 cỡ chữ trong một widget.

## Spacing & layout

- Khoảng cách widget: 12px (`gap-3`).
- Padding card: 16px (`p-4`).
- Bo góc: 12px (`rounded-xl`), control 8px.
- Dashboard: 12-column grid; widget 1–3 cột.
- Sidebar: 244px; topbar 64px.
- Mobile: 1 cột; nav ngang gọn.

## Component nền

Đã dựng trong `src/components/v5/ui`:

- `Button` — default / secondary / outline / ghost / danger.
- `Card` — header/title/description/content.
- `Badge` — default / accent / success / warning / danger.
- `Progress`.

Quy ước component:

- Dùng `cn()` để merge class.
- Variant bằng `class-variance-authority`.
- Control có focus ring, disabled state, kích thước 36–40px.
- Icon dùng `lucide-react` (không trộn Material Symbols trong V5).

## Dashboard V5

- KPI row: 4 widget nhỏ.
- Hero Thu NSNN: số lớn, target, 4 mốc so sánh.
- Tiến độ điều hành: progress + 4 trạng thái.
- Số liệu giao ban: lưới widget theo chỉ tiêu.
- Cảnh báo + tải công việc theo bộ phận.

Nguyên tắc:

- Tối đa 12 widget chỉ tiêu ở dashboard.
- Widget có: tên, mã, đơn vị, giá trị kỳ, trạng thái, mini trend.
- Không hiển thị bảng dài trên dashboard.
- Giá trị lớn rút gọn theo tỷ/triệu; tooltip giữ số gốc.
- Target bất thường (>300%) hiện cảnh báo thay vì khoe tỷ lệ sai.

## Migration plan

1. **Foundation** — token, shadcn primitives, V5 shell, `/v5` dashboard. *(đợt này)*
2. **Giao ban** — `/v5/giao-ban`: widget nhập liệu, lũy kế, so sánh.
3. **Công việc / Kế hoạch** — list, filter, detail, form.
4. **Báo cáo / Cấu hình** — data table dùng TanStack Table + V5 primitives.
5. **Cutover** — chỉ khi V5 ổn định; giữ route cũ để rollback.

## Không thay đổi

- API, Prisma schema, nghiệp vụ, phân quyền.
- Dữ liệu Production.
- Route cũ.

## Kiểm tra

- `pnpm build`.
- `npx tsc --noEmit`.
- Kiểm tra `/v5` bằng tài khoản thật.
- So sánh số liệu V5 với dashboard cũ trước khi cutover.
