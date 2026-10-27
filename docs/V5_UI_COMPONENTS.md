# V5 UI Components

Bộ giao diện V5 dùng chung cho toàn hệ thống. Màu nền trắng, navy `#1B3461`, đỏ `#C62222`, vàng `#F2C41D`.

## Thành phần

| Component | Đường dẫn | Dùng cho |
|---|---|---|
| `PageHeader` | `src/components/v5/ui/page-header.tsx` | Tiêu đề trang, mô tả, badge và nhóm nút thao tác |
| `StatCard` | `src/components/v5/ui/stat-card.tsx` | KPI ngày/tuần/tháng, trạng thái đạt/chưa đạt |
| `FilterBar`, `FilterChip` | `src/components/v5/ui/filter-bar.tsx` | Bộ lọc kỳ, trạng thái, phạm vi; chip có `aria-pressed` |
| `DataTable` | `src/components/v5/ui/data-table.tsx` | Khung bảng cuộn ngang trên mobile, thống nhất border/typography |
| `EmptyState` | `src/components/v5/ui/empty-state.tsx` | Trạng thái chưa có dữ liệu, hướng dẫn thao tác tiếp theo |
| `V5Icon` | `src/components/v5/ui/icon.tsx` | Cầu nối tên icon Material cũ sang lucide; toàn bộ giao diện dùng một hệ icon |

## Quy ước

- Ưu tiên `PageHeader` thay vì tự dựng `<header>` ở từng trang.
- KPI dùng `StatCard`; trạng thái đạt/vượt dùng `tone="success"`, chưa đạt/quá hạn dùng `tone="danger"`.
- Bộ lọc dùng `FilterBar` + `FilterChip`, không tự tạo pill mới.
- Bảng dùng `DataTable`; trên mobile vẫn giữ cuộn ngang hoặc chuyển sang card ở các màn hình đã có card.
- Không dùng `material-symbols-outlined`; icon mới import trực tiếp từ `lucide-react`, icon cũ dùng `V5Icon`.
- Không đưa mã kỹ thuật (`RBAC`, `SHA-256`, `MD5`, `XLSX`, tên bảng DB) vào giao diện người dùng.

## Màn hình đã áp dụng

- Công việc của tôi: header, KPI, bộ lọc thời gian, khung bảng.
- Thông báo: header, bộ lọc, empty state.
- Công việc chỉ đạo, Phê duyệt, Báo cáo: header và chip lọc.
- Kế hoạch: chip chọn kỳ, phạm vi và góc nhìn Gantt.
- Toàn bộ icon Material đã được thay bằng lucide; font Material Symbols không còn được tải.
