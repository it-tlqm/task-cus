# DESIGN SYSTEM SPECIFICATION — GOOGLE STITCH VERIFIED (DESKTOP & MOBILE)
## DỰ ÁN: `talung-cus-work` (HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG)

> **Mục đích:** Tài liệu quy chuẩn Design Tokens, Typography, Màu sắc, Bố cục và Thành phần Giao diện (UI Components) được trích xuất và đồng bộ trực tiếp từ thiết kế thực tế trên **Google Stitch** (Project ID: `1706229019122664463`).  
> **Phiên bản:** 2.0.0 (Đã đồng bộ đầy đủ 7 màn hình Desktop và 3 màn hình Mobile 390px).

---

## 1. COLOR PALETTE & DESIGN TOKENS (CHUNG CHO DESKTOP & MOBILE)

| Token Name | Hex Code | Tailwind / Variable | Vị trí sử dụng |
|---|---|---|---|
| **Primary Navy Container** | `#17324D` | `bg-primary-container`, `text-primary-container` | Sidebar Desktop, Topbar Brand, Chữ tiêu đề |
| **Primary Deep** | `#001D36` | `bg-primary`, `text-primary` | Màu nhấn thương hiệu tối, chữ tiêu đề đậm |
| **Secondary Teal** | `#006A62` / `#0B766D` | `bg-secondary`, `text-secondary` | Nút hành động chính (Primary CTA), Tab đang chọn |
| **Secondary Container** | `#98EFE4` / `#9BF2E7` | `bg-secondary-fixed`, `text-on-secondary-fixed` | Badge chức vụ, highlight thành phần phụ |
| **Tertiary Mint** | `#EAF4F2` | `bg-tertiary-fixed`, `border-teal-200` | Nền thẻ làm nổi bật nhẹ, highlight dòng |
| **App Background** | `#F8FAFC` | `bg-app-bg` / `bg-surface` | Nền tổng thể toàn bộ trang web (Canvas level 0) |
| **Surface Lowest / White** | `#FFFFFF` | `bg-surface-container-lowest` | Nền Card nội dung, Bảng dữ liệu, Modal (Level 1) |
| **Surface Subtle** | `#F1F5F9` | `bg-surface-subtle` | Nền header bảng, ô tìm kiếm, tab không chọn |
| **Border Default** | `#E2E8F0` | `border-border-default` | Đường phân cách chính, viền bảng dữ liệu |
| **Border Subtle** | `#CBD5E1` | `border-border-subtle` | Viền input, viền dropdown, popover |

### Màu Trạng Thái Nghiệp Vụ Chuẩn (Business Status Colors):
- **Hoàn thành (`DONE`) / Đã duyệt:** Chữ `#059669` / `#087A5B`, Nền `#ECFDF5` (`status-success-bg`).
- **Đang triển khai (`IN_PROGRESS`):** Chữ `#1D4ED8`, Nền `#EFF6FF`.
- **Chờ duyệt (`WAITING_REVIEW`) / Cảnh báo:** Chữ `#D97706`, Nền `#FFFBEB` (`status-warning-bg`).
- **Quá hạn (`OVERDUE`) / Có vướng mắc (`BLOCKED`):** Chữ `#E11D48` / `#B42318`, Nền `#FFF1F2` (`status-danger-bg`).
- **Chưa thực hiện (`NOT_STARTED`) / Nháp:** Chữ `#64748B`, Nền `#F8FAFC` (`status-inactive-bg`).
- **Không phát sinh (`NOT_OCCURRED`):** Chữ `#0284C7`, Nền `#F0F9FF` (`status-unassigned-bg`).

---

## 2. QUY CHUẨN THIẾT KẾ MOBILE (390PX VIEWPORT)

Thiết kế Mobile được chuẩn hóa từ 3 màn hình thực tế trên Google Stitch:

1. **Công thái học ngón tay cái (Thumb-Flow Ergonomics):**
   - Vùng thao tác chính (CTA, bộ lọc kỳ, nút báo hoàn thành, nút báo vướng mắc) đặt trong tầm với ngón tay cái (Thumb zone).
   - Kích thước vùng chạm tối thiểu **44px × 44px** (tuân thủ WCAG Mobile Accessibility).
2. **Thanh điều hướng dưới đáy (Bottom Navigation Bar):**
   - Cố định ở đáy màn hình với khoảng đệm an toàn `pb-safe` (`env(safe-area-inset-bottom)`).
   - 4 mục điều hướng chính: **Công việc**, **Kế hoạch**, **Nhật ký**, **Mở rộng/Menu**.
3. **Thanh tiêu đề di động (Mobile Sticky Header):**
   - Chiều cao 56px (`h-14`) kèm `pt-safe` (`env(safe-area-inset-top)`).
   - Hiển thị logo/tên viết tắt `TALUNG-CUS-WORK`, badge cảnh báo `DEMO GIẢ LẬP`, chuông thông báo và avatar cán bộ.
4. **Card Thống Kê 2x2 (Personal Task Metric Grid):**
   - 4 ô tóm tắt nhanh: `Cần làm hôm nay`, `Sắp đến hạn`, `Chờ xác nhận`, `Đã hoàn thành`.
5. **Chuyển đổi Bảng thành Thẻ (Table to Card Transformation):**
   - Bảng dữ liệu nhiều cột của Desktop chuyển đổi thành chuỗi thẻ (Task Cards) xếp dọc. Mỗi thẻ có tiêu đề công việc, badge mã mẫu `[Mã Mẫu]`, người phối hợp, hạn giờ và nút tác nghiệp một chạm.

---

## 3. DANH SÁCH MÀN HÌNH ĐÃ XÁC MINH TRÊN STITCH

| Mã Screen ID | Tên màn hình trên Stitch | Thiết bị / Kích thước | Trạng thái đồng bộ |
|---|---|---|---|
| `089086aec3864b019c5af41b1319cf82` | **Dashboard Lãnh Đạo Điều Hành** | Desktop (2560×5910) | `SYNCED` |
| `d8279bd2bf0c4198b665f567223d0bf4` | **Kế Hoạch Công Tác Tuần** | Desktop (2560×5370) | `SYNCED` |
| `a1afd1c794c6454a8e161b43f25f4024` | **Công Việc Của Tôi** | Desktop (2560×4042) | `SYNCED` |
| `26cca4106e7047f0af538a76d53f9338` | **Nhiệm Vụ Chỉ Đạo & Giao Việc** | Desktop (2560×4772) | `SYNCED` |
| `6c85595ba47745ae9075391d1e280f87` | **Nhật Ký Tác Nghiệp & Biểu Mẫu Động** | Desktop (2560×3846) | `SYNCED` |
| `a4e5421378a643b8a65a7ec5600b17aa` | **Báo Cáo Trực Tuyến & Cấu Hình Mẫu XLSX** | Desktop (2560×4822) | `SYNCED` |
| `25d2bbef1eed4a3bb5aef7fcee376979` | **Quản Trị Hệ Thống & Cấu Hình** | Desktop (2560×4628) | `SYNCED` |
| `2443cdf63e214979b5a74c40779511ba` | **Công Việc Của Tôi (Mobile)** | Mobile (780×3528 / Viewport 390px) | `SYNCED` |
| `453d42cded034a6b807f9d88dcb5548d` | **Chi Tiết Nhiệm Vụ (Mobile)** | Mobile (780×3794 / Viewport 390px) | `SYNCED` |
| `a82b540bccfa44f18a4613e415e5efa4` | **Nhật Ký Tác Nghiệp (Mobile)** | Mobile (780×3458 / Viewport 390px) | `SYNCED` |
| `12417506320912864407` | **PROJECT_CONTEXT_HAI_QUAN_TA_LUNG.md** | Reference Doc (780×1768) | `SYNCED` |

### Các màn hình Mobile còn lại (`PENDING_DESIGN_MOBILE`):
- `MOB-01`: Dashboard Lãnh Đạo (Mobile)
- `MOB-02`: Kế Hoạch Công Tác Tuần (Mobile)
- `MOB-03`: Báo Cáo Trực Tuyến & XLSX (Mobile)
- `MOB-04`: Quản Trị Hệ Thống (Mobile)
*(Các màn hình này sẽ được code frontend tự động chuyển thể responsive theo cùng Design Tokens và Card Patterns của 3 màn hình Mobile đã có)*.
