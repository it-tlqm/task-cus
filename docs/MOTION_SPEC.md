# QUY CHUẨN THIẾT KẾ CHUYỂN ĐỘNG & MOTION DESIGN TOKENS
**Dự án:** WebApp Quản lý Kế hoạch & Điều hành Tác nghiệp Hải quan Cửa khẩu Quốc tế Tà Lùng (`talung-cus-work`)  
**Mục tiêu:** Tạo trải nghiệm người dùng hiện đại, trang nhã, mượt mà và có phản hồi tức thì, phù hợp với môi trường công vụ hành chính nghiêm cẩn.

---

## 1. MOTION DESIGN TOKENS (BẢNG THÔNG SỐ CHUẨN)

Hệ thống chuyển động tuân thủ nguyên tắc: **Tiết chế, có mục đích, không gây xao nhãng và tối ưu hiệu năng 60fps trên thiết bị di động.**

| Tên Token | Thời lượng (Duration) | Đường cong gia tốc (Easing) | Phạm vi áp dụng |
| :--- | :---: | :--- | :--- |
| `motion-fast` | **120ms – 150ms** | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Nút bấm Hover, Click/Press active scale `0.99`, Icon rotation toggle. |
| `motion-base` | **180ms – 220ms** | `ease-out` | Chuyển đổi Tab/Filter, Dropdown menu mở ra, Active menu indicator. |
| `motion-panel` | **220ms – 260ms** | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal popup, Drawer mở từ phải sang, Toast notification slide-in. |
| `motion-sheet` | **260ms – 300ms** | `cubic-bezier(0.25, 1, 0.5, 1)` | Mobile Bottom Sheet trượt từ đáy màn hình lên, Backdrop fade-in. |
| `motion-progress`| **300ms – 500ms** | `cubic-bezier(0.4, 0, 0.2, 1)` | Thanh tiến độ % thay đổi giá trị, Biểu đồ bar loading. |

---

## 2. QUY TẮC CHUYỂN ĐỘNG THEO THÀNH PHẦN

### A. Desktop App Shell & Navigation
1. **Collapsible Sidebar (260px $\leftrightarrow$ 72px):**
   - Chuyển đổi chiều rộng với `transition: width 220ms ease-in-out`.
   - Vùng nội dung chính co giãn nhịp nhàng, không gây giật khung hình (`layout shift`).
   - Active indicator có viền màu xanh đậm `#001d36` và nền `#eaedff` chuyển trạng thái êm dịu.
2. **Header & Profile Dropdown:**
   - Dropdown xuất hiện với hiệu ứng `opacity` từ 0 $\rightarrow$ 1 kết hợp dịch chuyển `translate-y-1` nhẹ 150ms.
   - Nút icon chuông và trợ giúp có hiệu ứng hover tăng độ tương phản nhẹ và hiệu ứng click bấm chìm tức thì.

### B. Mobile Navigation & Touch Interactions
1. **Bottom Navigation (Mobile 390px):**
   - Đảm bảo vùng chạm tối thiểu **44px × 44px**.
   - Icon active chuyển màu `#001d36` và có chấm báo hiệu nổi bật (`indicator dot`).
   - Khi chuyển tab không làm giật cuộn trang (preserve scroll context).
2. **Bottom Sheet & Action Drawers:**
   - Trượt từ cạnh dưới với `translate-y-full` $\rightarrow$ `translate-y-0`.
   - Backdrop màu tối có độ mờ 50% (`rgba(15, 23, 42, 0.5)`) fade-in 200ms.

### C. Buttons, Forms & Data Tables
1. **Micro-interactions trên Buttons:**
   - Hover: Đổi màu sắc tinh tế 150ms.
   - Press: `transform: scale(0.99)` tạo cảm giác cơ học xúc giác rõ ràng.
   - Loading: Spinner xoay tròn đều, nút chuyển trạng thái disabled, giữ nguyên độ rộng để tránh nhảy chữ.
2. **Data Tables & Accordions:**
   - Hover từng dòng dữ liệu: Nền sáng nhẹ `#F8FAFC` chuyển 120ms.
   - Mở rộng chi tiết dòng (Accordion): Chiều cao mở ra mượt mà, icon chevron xoay 90 độ.

---

## 3. KHẢ NĂNG TIẾP CẬN & ACCESSIBILITY (REDUCED MOTION)

Hệ thống tuân thủ nghiêm ngặt tiêu chuẩn **WCAG 2.1 AA** về chuyển động:
- Khi người dùng bật tính năng `prefers-reduced-motion: reduce` trên hệ điều hành (Windows Settings $\rightarrow$ Accessibility), toàn bộ animation phức tạp tự động vô hiệu hóa (`transition: none !important`), chỉ giữ lại thay đổi trạng thái màu sắc tức thì.
- Loại bỏ 100% các hiệu ứng nhấp nháy liên tục (flashing/strobe) có nguy cơ gây tiền đình hoặc động kinh.
- Giữ vững tỷ lệ tương phản văn bản chữ đen/xanh navy trên nền trắng tối thiểu **4.5:1**.
