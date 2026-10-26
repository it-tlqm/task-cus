# V5 Design System — Hải quan Tà Lùng

## Định hướng

Làm mới theo **shadcn/ui + Tailwind**, light mode **nền trắng chủ đạo**, điểm màu Hải quan Việt Nam:

- Navy Blue `#1B3461`
- Red `#C62222`
- Gold `#F2C41D`

Phong cách tham chiếu: shadcnblocks Admin Kit — sidebar trắng, topbar trắng, card viền mảnh, tab gạch chân, badge trạng thái, mật độ gọn.

## Token

| Semantic | Giá trị | Dùng cho |
|---|---|---|
| `v5-bg` | `#F7F8FA` | Nền trang |
| `v5-surface` | `#FFFFFF` | Card, sidebar, topbar |
| `v5-ink` | `#111827` | Chữ chính |
| `v5-muted` | `#64748B` | Chữ phụ |
| `v5-line` | `#E5E7EB` | Viền, divider |
| `v5-accent` | `#1B3461` | Button chính, tab active, link |
| `v5-accent-soft` | `#EEF2F8` | Nền nhấn navy |
| `v5-red` | `#C62222` | Lỗi, quá hạn, cảnh báo nặng |
| `v5-danger` | `#C62222` | Semantic danger |
| `v5-danger-soft` | `#FDECEC` | Nền danger |
| `v5-gold` | `#F2C41D` | Điểm nhấn, cảnh báo, trạng thái chờ |
| `v5-gold-soft` | `#FFF8DC` | Nền gold |
| `v5-gold-ink` | `#6B4E00` | Chữ trên nền gold |
| `v5-success` | `#0E7A4D` | Hoàn thành, đã chốt |
| `v5-success-soft` | `#ECFDF3` | Nền success |

Quy tắc:

- Không dùng hex trực tiếp trong component V5.
- Nền chủ đạo là trắng; màu Hải quan chỉ dùng làm điểm nhấn.
- Gold không dùng làm chữ trên nền trắng; dùng `gold-ink` cho chữ.
- Navy dùng cho hành động chính, tab active, link.
- Red dùng cho quá hạn/lỗi; không dùng cho trang trí.

## Typography

- Font: **Inter** (hỗ trợ tiếng Việt).
- Số liệu: `tabular-nums`, weight 600–700.
- Tiêu đề trang: 24px / 600.
- Tiêu đề card: 14px / 600.
- Nhãn nhỏ: 10–11px.
- Không dùng quá 3 cỡ chữ trong một widget.

## Layout

- Sidebar trắng 248px, border phải.
- Topbar trắng 56px, border dưới.
- Nền nội dung `#F7F8FA`.
- Card trắng, border `#E5E7EB`, bo 8–12px, shadow rất nhẹ.
- Dashboard 12 cột; widget 1–3 cột.
- Mobile: 1 cột; nav ngang gọn.

## Component

Đã dựng trong `src/components/v5/ui`:

- Button — default navy / secondary / outline / ghost / danger.
- Card — header/title/description/content.
- Badge — default / accent / success / warning (gold) / danger.
- Progress.

Quy ước:

- `cn()` merge class.
- Variant bằng `class-variance-authority`.
- Button/control cao 32–40px; focus ring navy.
- Icon `lucide-react`; không trộn Material Symbols trong V5.
- Sidebar/topbar/card đều nền trắng, viền mảnh.

## Dashboard V5

- Breadcrumb + tiêu đề + tab gạch chân.
- KPI row 4 widget.
- Hero Thu NSNN: số lớn, target, 4 mốc so sánh.
- Tiến độ điều hành.
- Lưới widget Số liệu giao ban.
- Cảnh báo + tải công việc.
- Cảnh báo target >300% thay vì hiển thị tỷ lệ sai.

## Phạm vi

- `/v5` là preview song song, chưa thay production.
- Trang cũ vẫn hoạt động.
- AppShell cũ bỏ qua khi vào `/v5`.

## Migration

1. Foundation + dashboard. *(đã dựng)*
2. Giao ban.
3. Công việc / Kế hoạch.
4. Báo cáo / Cấu hình.
5. Cutover khi ổn định.

Không đổi API, Prisma schema, nghiệp vụ hoặc dữ liệu Production.
