# YC-30 — TÁI CẤU TRÚC SIDEBAR / ĐIỀU HƯỚNG — BÁO CÁO HOÀN CÔNG

**Ngày:** 20/10/2026 · **Phạm vi:** Frontend / navigation / layout (không đổi nghiệp vụ, không DB migration)
**Base:** commit `22309bb` (YC-31/32 đã deploy Production)

---

## 1. Kết quả triển khai

YC-30 được triển khai đầy đủ trên frontend:

- **Cấu hình điều hướng tập trung** tại `src/config/navigation.ts` — một nguồn sự thật duy nhất cho menu, phân quyền hiển thị, active state và breadcrumb. Không còn mảng menu rời rạc trong `Sidebar.tsx`/`BottomNav.tsx`.
- **Sidebar desktop** viết lại: 7 nhóm nghiệp vụ, nhóm cha mở/thu gọn (ghi nhớ trạng thái), active state chính xác, tự mở nhóm cha khi vào trang con, thu gọn còn 72px kèm tooltip, footer rõ ràng.
- **Drawer mobile mới** (`MobileNavDrawer.tsx`): thay thế bottom-sheet "Thêm" trùng menu; có focus trap, Escape đóng, khoá cuộn trang, đóng tự động khi chuyển trang, hiển thị người dùng – vai trò – đơn vị – đổi mật khẩu – đăng xuất.
- **Breadcrumb** (`Breadcrumb.tsx`): desktop đặt trong header, mobile là dải mảnh trên đầu nội dung; sinh tự động từ cấu hình điều hướng nên luôn khớp menu.
- **BottomNav mobile** rút gọn còn 4 lối tắt + nút "Menu" mở drawer đầy đủ.
- **Header desktop**: thay khối "logo + Đơn vị" cứng bằng breadcrumb thật, giữ ô tìm kiếm và bộ lọc đơn vị; thông tin người dùng hiển thị tên + chức danh + đơn vị; đăng xuất/đổi mật khẩu rõ ràng.
- **Nhãn "Việc của tôi" → "Việc cá nhân"** áp dụng đồng bộ ở menu, bottom nav, tiêu đề trang, trang hướng dẫn và dữ liệu hướng dẫn theo màn hình.
- **Không đổi quyền backend**: mọi kiểm tra phân quyền ở API (`src/server/guard.ts`) giữ nguyên; menu chỉ ẩn mục mà tài khoản không dùng được.

---

## 2. Cấu trúc menu: cũ → mới

### 2.1. Menu cũ (7 nhóm, 27 mục, gộp lẫn nghiệp vụ và quản trị)

| Nhóm cũ | Mục |
|---|---|
| Tổng Quan | Bảng điều hành · Hướng dẫn 5 phút |
| Công Việc | Việc của tôi · Việc đơn vị · Việc tháng của tôi · Kế hoạch tuần · Phê duyệt · Biên bản giao ban · Sổ văn bản |
| Giao Ban | Số liệu giao ban · Nhập số liệu · Báo cáo giao ban (Word) · Cấu hình số liệu |
| Lịch & Nghỉ | Nhật ký ca trực · Lịch công tác · Lịch trực ca · Nghỉ phép & công tác |
| Báo Cáo | Báo cáo tuần · Xuất Excel · Số liệu đã chốt |
| Danh Mục | Mẫu công việc tuần · Sản phẩm QĐ1277 |
| Quản Trị | Tổ chức & Nhân sự · Biểu mẫu & Quy trình · Cấu hình hệ thống · Nhật ký hệ thống · Góp ý & Báo lỗi |

**Vấn đề của menu cũ:**
1. "Công Việc" trộn 3 loại việc khác nhau (cá nhân / bộ phận / kết quả tháng) với biên bản giao ban và sổ văn bản.
2. Nhóm "Danh Mục" chứa cả danh mục quản trị (Mẫu công việc tuần) lẫn danh mục tra cứu (Sản phẩm QĐ1277) → dễ nhầm "Mẫu tuần" với "Sản phẩm QĐ1277", đúng cái rủi ro YC-30 yêu cầu tránh.
3. Nhóm "Giao Ban" chứa "Cấu hình số liệu" (mục quản trị) lẫn 3 mục xem/nhập.
4. "Phê duyệt" nằm chung nhóm với việc cá nhân → cán bộ không có quyền vẫn thấy cả cụm.
5. Nhãn "Việc của tôi"/"Việc đơn vị"/"Việc tháng" không nhất quán với tên trang; "Nhật ký ca trực" gọi sai trang `/routine` (thực chất là Nhật ký tác nghiệp).

### 2.2. Menu mới (7 nhóm, 27 mục, tách bạch nghiệp vụ / quản trị)

| Nhóm mới | Mục (route) | Quyền hiển thị |
|---|---|---|
| **Tổng quan & điều hành** | Bảng điều hành (`/dashboard`) | mọi cán bộ |
| | Số liệu giao ban (`/giao-ban`) | mọi cán bộ |
| | Nhập số liệu giao ban (`/giao-ban/nhap`) | mọi cán bộ |
| | Báo cáo giao ban (`/giao-ban/bao-cao`) | mọi cán bộ |
| | Biên bản giao ban (`/meetings`) | mọi cán bộ |
| **Công việc cá nhân** | Việc cá nhân (`/my-work`) | mọi cán bộ |
| **Công việc bộ phận** | Kế hoạch tuần (`/plans`) | mọi cán bộ |
| | Việc đột xuất (`/tasks`) | mọi cán bộ |
| | Phê duyệt (`/approvals`) | lãnh đạo đơn vị / trưởng bộ phận |
| **Trực ca & nghiệp vụ** | Nhật ký tác nghiệp (`/routine`) | mọi cán bộ |
| | Lịch trực (`/roster`) | mọi cán bộ |
| | Lịch công tác (`/calendar`) | mọi cán bộ |
| | Nghỉ phép & công tác (`/leaves`) | mọi cán bộ |
| | Sổ văn bản (`/docs`) | mọi cán bộ |
| **Kết quả & báo cáo** | Kết quả công tác tháng (`/monthly-results`) | mọi cán bộ |
| | Báo cáo & tổng hợp (`/reports`) | mọi cán bộ |
| | Xuất Excel (`/reports/excel`) | có quyền xuất báo cáo |
| | Số liệu đã chốt (`/reports/snapshots`) | có quyền chốt kỳ |
| **Danh mục & quy định** | Sản phẩm QĐ1277 (`/products`) | mọi cán bộ |
| **Quản trị hệ thống** | Danh mục công việc (`/admin/catalog`) | có quyền `catalog.manage` |
| | Tổ chức & nhân sự (`/admin/organization`) | có quyền `org.manage`/`users.manage` |
| | Biểu mẫu & quy trình (`/admin/forms`) | có quyền `form.manage` |
| | Cấu hình số liệu giao ban (`/giao-ban/cau-hinh`) | lãnh đạo / quản trị hệ thống |
| | Cấu hình hệ thống (`/admin/system`) | lãnh đạo / quản trị hệ thống |
| | Nhật ký hệ thống (`/admin/audit`) | có quyền `audit.view` |
| | Góp ý & báo lỗi (`/admin/feedback`) | lãnh đạo / quản trị hệ thống |

Nhóm "Quản trị hệ thống" mặc định **gập**, các nhóm khác mặc định mở; trạng thái gập/mở được ghi nhớ theo máy (`hqtl-nav-open-v2`).

---

## 3. Danh sách chức năng / route được di chuyển

| Route | Menu cũ | Menu mới | Ghi chú |
|---|---|---|---|
| `/dashboard` | Tổng Quan | Tổng quan & điều hành | Giữ nguyên route |
| `/giao-ban` | Giao Ban | Tổng quan & điều hành | Giữ nguyên route |
| `/giao-ban/nhap` | Giao Ban → "Nhập số liệu" | Tổng quan & điều hành → "Nhập số liệu giao ban" | Giữ nguyên route |
| `/giao-ban/bao-cao` | Giao Ban | Tổng quan & điều hành | Giữ nguyên route |
| `/giao-ban/cau-hinh` | Giao Ban (quản trị) | Quản trị hệ thống | Tách khỏi nhóm nghiệp vụ |
| `/meetings` | Công Việc | Tổng quan & điều hành | — |
| `/my-work` | Công Việc → "Việc của tôi" | Công việc cá nhân → **"Việc cá nhân"** | Đổi nhãn theo YC-30 |
| `/plans` | Công Việc | Công việc bộ phận | — |
| `/tasks` | Công Việc → "Việc đơn vị" | Công việc bộ phận → "Việc đột xuất" | Đổi nhãn theo YC-30 |
| `/approvals` | Công Việc | Công việc bộ phận | Giữ `leadersOnly` |
| `/routine` | Lịch & Nghỉ → "Nhật ký ca trực" | Trực ca & nghiệp vụ → **"Nhật ký tác nghiệp"** | Nhãn đúng với chức năng thật của trang |
| `/roster` | Lịch & Nghỉ | Trực ca & nghiệp vụ | — |
| `/calendar` | Lịch & Nghỉ | Trực ca & nghiệp vụ | — |
| `/leaves` | Lịch & Nghỉ | Trực ca & nghiệp vụ | — |
| `/docs` | Công Việc | Trực ca & nghiệp vụ | — |
| `/monthly-results` | Công Việc → "Việc tháng của tôi" | Kết quả & báo cáo → **"Kết quả công tác tháng"** | Đổi nhãn theo YC-30 |
| `/reports` | Báo Cáo | Kết quả & báo cáo | — |
| `/reports/excel` | Báo Cáo (needExport) | Kết quả & báo cáo (requireExport) | Route cũ vẫn redirect đúng |
| `/reports/snapshots` | Báo Cáo (needLock) | Kết quả & báo cáo (requireLock) | Route cũ vẫn redirect đúng |
| `/products` | Danh Mục | Danh mục & quy định | Tách khỏi danh mục quản trị |
| `/admin/catalog` | Danh Mục → "Mẫu công việc tuần" (adminOnly) | Quản trị hệ thống → "Danh mục công việc" (`catalog.manage`) | Tách khỏi Sản phẩm QĐ1277 |
| `/admin/organization` | Quản Trị | Quản trị hệ thống | — |
| `/admin/forms` | Quản Trị | Quản trị hệ thống | — |
| `/admin/system` | Quản Trị | Quản trị hệ thống | — |
| `/admin/audit` | Quản Trị | Quản trị hệ thống | — |
| `/admin/feedback` | Quản Trị | Quản trị hệ thống | — |
| `/huong-dan` | Tổng Quan | Chân thanh menu (desktop) + chân drawer (mobile) | Link cố định, không mất đường vào |
| `/notifications` | (chỉ nút trên header) | Nút thông báo trên header + tab "Thông báo" của bottom nav | — |

**Không có route nào bị đổi tên hoặc bị xoá.** Các route cũ `/`, `/admin`, `/reports/excel`, `/reports/snapshots` vẫn hoạt động (redirect nội bộ) — đã kiểm thử tự động.

### 3.1. Các chức năng được yêu cầu nhưng **không tạo trang giả**

| Yêu cầu trong đề bài | Xử lý | Lý do |
|---|---|---|
| "Thuế" / "Kim ngạch XNK" thành mục menu riêng | **Không tạo** | Chỉ tồn tại dưới dạng *phần* trong Bảng điều hành và Số liệu giao ban (`TaxSummarySection`), không có route riêng. Được mô tả trong gợi ý của mục "Bảng điều hành" và "Số liệu giao ban". |
| "Nhật ký ca trực" là mục riêng | **Không tạo** | Trang `/routine` là Nhật ký tác nghiệp nghiệp vụ; lịch trực nằm ở `/roster`. Đã đặt đúng nhãn theo chức năng thật, không tạo trang mới. |
| "Kế hoạch tháng" | **Không tạo** | Chưa có route kế hoạch tháng; kế hoạch tuần `/plans` đã chứa cả hạng mục tháng theo kỳ. |
| "Danh mục đầu việc theo bộ phận" là mục riêng | **Không tạo** | Là quản lý danh mục trong `/plans` và `/api/department-work-items` (YC-25), không có route riêng. |
| "Đánh giá, chấm điểm, xếp loại" | **Không tạo** | Chưa có chức năng (thuộc YC-33+). Trang kết quả tháng hiện nêu rõ "chưa chấm điểm". |

---

## 4. Thành phần frontend đã chỉnh sửa

| Tệp | Loại | Nội dung thay đổi |
|---|---|---|
| `src/config/navigation.ts` | **Mới** | Cấu hình điều hướng tập trung: 7 nhóm, 27 mục, quy tắc quyền (`leadersOnly`, `adminOnly`, `permission`, `permissionsAny`, `requireExport`, `requireLock`), `filterNavigation`, `isItemActive`, `findActiveNavigation`, `getBreadcrumbTrail`, `NAVIGATION_HREFS` |
| `src/components/layout/NavigationList.tsx` | **Mới** | Render menu dùng chung desktop/drawer; lọc quyền; nhóm cha gập/mở + ghi nhớ; tự mở nhóm khi vào trang con; active state; tooltip khi thu gọn |
| `src/components/layout/MobileNavDrawer.tsx` | **Mới** | Drawer mobile: focus trap, Escape, khoá cuộn body, focus vào nút đóng, đóng khi đổi route, thẻ người dùng + vai trò + đơn vị, đổi mật khẩu, đăng xuất |
| `src/components/layout/Breadcrumb.tsx` | **Mới** | Breadcrumb sinh từ cấu hình điều hướng, có `aria-current`, tự ẩn cấp trung gian trên màn hình hẹp |
| `src/lib/client-session.ts` | **Mới** | `clearClientSession()` — đăng xuất dùng chung (xoá cookie phiên, cache quyền client, token localStorage) |
| `src/components/layout/Sidebar.tsx` | Sửa | Viết lại: 7 nhóm, gập/mở, thu gọn 72px, tooltip, footer hướng dẫn + trạng thái |
| `src/components/layout/Header.tsx` | Sửa | Breadcrumb desktop; header mobile có nút hamburger + avatar mở drawer; thông tin người dùng thật (tên/chức danh/đơn vị) thay dữ liệu giả; nhãn vai trò theo mã role chuẩn; đăng xuất dùng `clearClientSession` |
| `src/components/layout/BottomNav.tsx` | Sửa | 4 lối tắt + nút "Menu" mở drawer; bỏ bottom-sheet "Thêm" trùng menu; nhãn "Việc cá nhân" |
| `src/components/layout/AppShell.tsx` | Sửa | Quản lý trạng thái drawer, đóng khi đổi route; biến `--sidebar-width` cho nút nổi; link "Bỏ qua điều hướng"; breadcrumb mobile trong `main` |
| `src/components/ui/ContextHelp.tsx` | Sửa | Nút "?" neo theo bề rộng sidebar (kể cả khi thu gọn) |
| `src/components/ui/FeedbackButton.tsx` | Sửa | Nút "Góp ý" neo theo bề rộng sidebar (kể cả khi thu gọn) |
| `src/hooks/usePermissions.ts` | Sửa | Bổ sung `personCode`, `positionTitle`, `unitId`, `unitName` vào kiểu dữ liệu phiên client |
| `src/app/my-work/page.tsx` | Sửa | Tiêu đề "Việc cá nhân — Không Gian Tác Nghiệp Cán Bộ" |
| `src/app/plans/page.tsx` | Sửa | Câu chú thích "mục Việc cá nhân" |
| `src/app/huong-dan/page.tsx` | Sửa | Sơ đồ hướng dẫn + nhãn mục đồng bộ menu mới |
| `src/data/page-help.ts` | Sửa | Tiêu đề hướng dẫn theo màn hình đồng bộ nhãn menu mới |
| `src/app/globals.css` | Không đổi | Dùng lại token sẵn có (`focus-ring`, `no-scrollbar`, `custom-scrollbar`) |

**Không thay đổi:** mọi route handler trong `src/app/api/**`, `src/server/**`, schema Prisma, logic tính điểm, quy trình phê duyệt, danh mục TX và trạng thái kích hoạt.

---

## 5. Hiển thị theo vai trò

Nguồn quyền hiển thị: `usePermissions` (đọc `/api/auth/me`) — **display-only**, backend vẫn là lớp chặn cuối.

| Vai trò | Menu hiển thị |
|---|---|
| **Công chức (STAFF)** | Tổng quan & điều hành · Công việc cá nhân · Công việc bộ phận (Kế hoạch tuần, Việc đột xuất) · Trực ca & nghiệp vụ · Kết quả & báo cáo (Kết quả công tác tháng, Báo cáo & tổng hợp) · Danh mục & quy định (Sản phẩm QĐ1277). **Không** thấy: Phê duyệt, Xuất Excel, Số liệu đã chốt, toàn bộ Quản trị hệ thống. |
| **Trưởng bộ phận (DEPARTMENT_LEADER)** | Như trên **+ Phê duyệt, Xuất Excel, Số liệu đã chốt**. Vẫn không thấy Quản trị hệ thống (đúng phạm vi phân quyền hiện có). |
| **Lãnh đạo đơn vị (UNIT_LEADER)** | Toàn bộ menu, gồm Phê duyệt, Xuất Excel, Số liệu đã chốt và nhóm Quản trị hệ thống. Nhóm Quản trị mặc định gập cho gọn. |
| **Quản trị hệ thống (SYSTEM_ADMIN)** | Nhóm Quản trị hệ thống (Danh mục công việc, Tổ chức & nhân sự, Biểu mẫu & quy trình, Cấu hình hệ thống, Nhật ký hệ thống, Góp ý & báo lỗi). **Không** thấy Phê duyệt (không có quyền nghiệp vụ) và không thấy các mục nghiệp vụ mà API chặn tài khoản quản trị kỹ thuật. |

Đối chiếu backend (đo trên API thật, DB local):

| API | STAFF | UNIT_LEADER | SYSTEM_ADMIN |
|---|---|---|---|
| `/api/tasks`, `/api/plans`, `/api/meetings`, `/api/leaves`, `/api/docs`, `/api/rosters`, `/api/personal-work-items`, `/api/monthly-results`, `/api/dashboard/kpi`, `/api/products`, `/api/work-catalog` | theo phạm vi | 200 | **403** (chặn nghiệp vụ — giữ nguyên thiết kế cũ) |
| `/api/catalog/templates`, `/api/catalog/groups`, `/api/admin/*`, `/api/roles`, `/api/people`, `/api/org-units/tree`, `/api/metrics/admin` | theo phạm vi | 200 | 200 |

---

## 6. Kết quả kiểm thử desktop & mobile

### 6.1. Kiểm thử cấu trúc điều hướng (không cần DB/server)

`scripts/test-yc30-navigation.ts` → **189 pass / 0 fail**

- Mọi href trong menu có route thật trong `src/app` (0 mục trỏ trang giả).
- Mọi route nghiệp vụ trong `src/app` đều được menu bao phủ (0 chức năng mất đường vào).
- 0 href trùng lặp; cấu trúc nhóm/mục hợp lệ.
- Lọc theo 4 vai trò đúng (STAFF / DEPARTMENT_LEADER / UNIT_LEADER / SYSTEM_ADMIN).
- Active state: `/giao-ban` không "nuốt" `/giao-ban/nhap`; `/tasks` active ở `/tasks/<id>`; `/dashboard` active ở `/`; `/reports` active ở `/reports/excel`.
- Breadcrumb đúng cho 8 route đại diện.
- 0 nhãn menu chứa thuật ngữ kỹ thuật (Backend/RPC/RLS/Storage/Supabase/API/PostgreSQL/Token).
- Nhãn "Việc cá nhân" hiện đồng nhất, không còn "Việc của tôi".

### 6.2. Kiểm thử giao diện thật (Chrome/Brave, 1600×1000 và 390×844)

`scripts/test-yc30-ui.ts` → **48 pass / 0 fail** trên môi trường local (chạy ổn định 2 lần liên tiếp); trên Production: **46 pass / 0 fail** (2 nhóm kiểm tra trưởng bộ phận bị bỏ sung vì Production không có tài khoản trưởng bộ phận demo)

**Desktop**
- 7 nhóm điều hướng render đúng; lãnh đạo thấy đủ 25 mục nghiệp vụ + quản trị.
- Active state đúng trên trang con (`/giao-ban/nhap`).
- Breadcrumb hiển thị đúng dải.
- Nhóm cha có `aria-expanded`, tự mở khi vào trang con.
- Thu gọn: 260px → 72px, ẩn nhãn chữ chỉ còn icon, có tooltip (`title`) cho từng mục.
- Trạng thái thu gọn **giữ sau refresh**; mở rộng lại 260px.
- 5 route cũ (`/reports/excel`, `/reports/snapshots`, `/admin`, `/huong-dan`, `/notifications`) truy cập được, không lỗi 5xx.
- Click menu điều hướng đúng; menu nhận focus bằng bàn phím.
- Công chức không thấy Phê duyệt / nhóm quản trị / Cấu hình số liệu giao ban; vẫn thấy Việc cá nhân, Kế hoạch tuần, Việc đột xuất, Nhật ký tác nghiệp, Sản phẩm QĐ1277.
- Trưởng bộ phận thấy Phê duyệt, không thấy nhóm quản trị.

**Mobile**
- Sidebar desktop ẩn hoàn toàn; bottom nav hiển thị 4 lối tắt + "Menu".
- Drawer mở đúng, **không tràn màn hình**; focus tự vào nút đóng.
- Drawer có đủ 7 nhóm, thẻ người dùng + vai trò + đơn vị, nút đổi mật khẩu và đăng xuất.
- **Escape đóng được** drawer; chuyển trang → drawer đóng lại; cuộn trang bị khoá khi mở.
- Breadcrumb mobile hiển thị đúng.
- Active state đúng trên `/tasks`; refresh `/tasks` vẫn tải được.
- 0 lỗi console, 0 HTTP 5xx.

Ảnh kiểm thử: `demo-ops/yc30-ui/` (desktop-dashboard, desktop-sidebar-collapsed, desktop-staff-dashboard, mobile-drawer, mobile-plans).

---

## 7. Kết quả kiểm thử hồi quy YC-23 → YC-32

`scripts/test-yc30-regression.ts` → **60 pass / 0 fail** trên dev server + PostgreSQL local; **56 pass / 0 fail** trên Production (bỏ qua 2 nhóm kiểm tra quản trị hệ thống do Production không có tài khoản SYSTEM_ADMIN demo)

| Nhóm | Nội dung | KQ |
|---|---|---|
| A. Route trong menu | 27 route (menu + hướng dẫn + thông báo) trả HTTP 200, không 5xx | 27/27 |
| B. Route cũ | `/`, `/reports/excel`, `/reports/snapshots`, `/admin` — không lỗi 5xx (307 redirect đúng đích) | 4/4 |
| C. API nghiệp vụ | Công việc cá nhân + phân trang + minh chứng (YC-31/32), kế hoạch (YC-23), nhiệm vụ (YC-04), danh mục mẫu cũ (YC-05), danh mục TX + chế độ quản trị (YC-31), sản phẩm QĐ1277 (YC-11), kết quả tháng (YC-14), tổng hợp báo cáo (YC-24), số liệu giao ban (YC-26), nhập số liệu (YC-28), lịch trực, nghỉ phép (YC-09), sổ văn bản (YC-12), biên bản (YC-18), thông báo, nhật ký tác nghiệp (YC-16), danh mục đầu việc bộ phận (YC-25), KPI bảng điều hành (YC-29) | 22/22 |
| D. Xuất Excel (YC-24) | `/api/monthly-export` template `bang1` (19.731 bytes) và `02c` (9.087 bytes) — file XLSX hợp lệ (chữ ký PK) | 2/2 |
| E. Quyền theo vai trò | Cán bộ đọc được nhiệm vụ của mình; cán bộ bị chặn `/api/admin/audit` (403); quản trị hệ thống bị chặn API nhiệm vụ (403) và danh mục TX (403, giữ nguyên YC-31) nhưng vẫn xem được danh mục mẫu cũ và trung tâm quản trị | 5/5 |

**TypeScript:** `npx tsc --noEmit` — 0 lỗi.
**Build Production:** `npm run build` — thành công (không lỗi compile, không lỗi type).
**Lint:** dự án **chưa cấu hình ESLint** (`next lint` mở màn hình hỏi cấu hình) — không thêm cấu hình mới ngoài phạm vi YC-30; đã bù lại bằng typecheck + 3 bộ test tự động.

---

## 8. Commit, branch và Vercel

| Mục | Giá trị |
|---|---|
| Branch | `main` |
| Commit YC-30 | `170a398` — `feat(yc30): tai cau truc sidebar va he thong dieu huong` |
| Base (YC-31/32) | `22309bb` |
| Production | `https://task-cus.vercel.app` |
| Health sau deploy | `{"success":true,"status":"ok","db":"up","commit":"170a398","env":"production"}` |

### 8.1. Kết quả xác minh trên Production

| Bộ kiểm thử | Kết quả |
|---|---|
| `test-yc30-navigation.ts` (cấu trúc menu) | **189 / 189** |
| `test-yc30-regression.ts` (hồi quy YC-23 → YC-32) | **56 / 56** (2 nhóm kiểm tra quản trị hệ thống bị bỏ qua: Production không có tài khoản SYSTEM_ADMIN demo) |
| `test-yc30-ui.ts` (giao diện desktop + mobile) | **46 / 46** (2 nhóm kiểm tra trưởng bộ phận bị bỏ qua: Production không có tài khoản trưởng bộ phận demo) |
| Smoke API YC-31/32 (bộ có sẵn) | **54 / 55** — mục fail duy nhất là điều kiện so sánh commit hardcode `eee6321`; health thực tế là `commit=170a398`, `db=up` |
| Smoke UI YC-31/32 (bộ có sẵn) | **14 / 14** — upload minh chứng qua UI, API xác nhận minh chứng, danh mục TX (chưa nhập/chưa kích hoạt), không lỗi console, không lỗi trang |

### 8.2. Kiểm tra dữ liệu Production sau triển khai

| Bảng | Số bản ghi | Kết luận |
|---|---|---|
| `work_catalog_versions` | 0 | TX vẫn **chưa nhập/kích hoạt** — giữ nguyên như trước YC-30 |
| `work_catalog_entries` | 0 | Không đồng nhất TX với danh mục sản phẩm QĐ1277 |
| `work_catalog_department_mappings` | 0 | Ánh xạ bộ phận vẫn chờ xác nhận (YC-31) |
| `activity_templates` | 48 | 48 mẫu công việc cũ vẫn dùng bình thường |
| `personal_work_items` | 26 | Không phát sinh dữ liệu nghiệp vụ từ YC-30 |
| `work_evidences` | 0 | Không đính kèm minh chứng rác |
| `tasks` / `plans` / `accounts` | 18 / 5 / 24 | Không đổi |
| Dữ liệu test sót lại (`[SMOKE…]`, `DBG-…`) | 0 | Đã dọn sạch |

**Không thực hiện:** `prisma migrate deploy`, DDL/DML, thay đổi danh mục TX hoặc trạng thái kích hoạt, xoá/reset dữ liệu Production. Ba bản ghi `DBG-*` do chính phiên kiểm thử tạo ra đã được xoá bằng API chính của ứng dụng (`DELETE /api/personal-work-items?id=…`) ngay sau khi phát hiện.

---

## 9. Hạn chế & vấn đề còn tồn tại

1. **Chưa có "Thuế" / "Kim ngạch XNK" là mục menu riêng** — vì chưa có route riêng. Số liệu thuế/kim ngạch nằm trong Bảng điều hành và Số liệu giao ban. Nếu nghiệp vụ muốn tách màn hình riêng thì cần một YC riêng (kèm route + API).
2. **Chưa có trang "Nhật ký ca trực"** — `/routine` là Nhật ký tác nghiệp nghiệp vụ, `/roster` là lịch trực. YC-30 chỉ sửa nhãn theo chức năng thật.
3. **Chưa có chức năng chấm điểm / xếp loại / đánh giá** — thuộc YC-33+; menu chưa và không nên có mục giả.
4. **Danh mục TX 143 đầu việc vẫn chưa kích hoạt trên Production** (chờ xác nhận ánh xạ bộ phận — xem `docs/TX_DEPARTMENT_MAPPING_2026-10-20.md`); YC-30 không thay đổi trạng thái này.
5. **`task-attachments` còn public** (2 object, 4 policy `{public}`) — đã ghi nhận, xử lý đợt riêng, không đụng trong YC-30.
6. **Chưa có quy trình gia hạn hạn sau khi duyệt** (đang 403 + ghi audit) — ngoài phạm vi YC-30.
7. **Chưa có ESLint config** trong dự án — `npm run lint` dừng ở bước hỏi cấu hình. Không tự ý thêm.
8. **Tài khoản quản trị hệ thống vẫn bị chặn các API nghiệp vụ** (403) theo thiết kế bảo mật sẵn có; menu đã bám theo đúng hành vi đó.

---

## 10. Đề xuất bước tiếp theo cho YC-33

1. **Chốt danh sách chức năng chấm điểm/xếp loại** (YC-33) trước khi code: công thức, hệ số, kỳ chấm, thẩm quyền chấm, ai duyệt điểm — rồi mới thiết kế màn hình. Nhóm menu "Kết quả & báo cáo" đã có chỗ để gắn mục mới.
2. **Bổ sung mục menu kèm route thật** cho "Kết quả đánh giá" khi YC-33 có trang; lúc đó chỉ cần thêm một mục vào `src/config/navigation.ts` — không phải sửa lại sidebar.
3. **Hoàn thiện ánh xạ TX theo bộ phận** để kích hoạt 143 đầu việc; khi đó kiểm tra lại mục "Danh mục công việc" trong nhóm Quản trị (đã tách riêng khỏi "Sản phẩm QĐ1277").
4. **Duyệt lại nhãn "Nhật ký tác nghiệp"** với nghiệp vụ: nếu thực tế muốn gọi là "Nhật ký ca trực" thì cần đổi cả nhãn trang + dữ liệu hướng dẫn, không chỉ menu.
5. **Bổ sung kiểm thử tự động vào CI** khi dự án có ESLint/Pipeline; hiện 3 bộ test YC-30 chạy thủ công bằng `npx tsx`.
6. **Xử lý `task-attachments` (public)** và bổ sung quy trình gia hạn hạn sau duyệt trước khi mở rộng thêm phân hệ.

---

## Phụ lục — Cách chạy lại bộ kiểm thử

```bash
# 1) Kiểm thử cấu trúc điều hướng (không cần DB)
npx tsx scripts/test-yc30-navigation.ts

# 2) Kiểm thử giao diện thật (desktop + mobile)
#    Cần dev server: npx next dev -p 3100  (DB local)
npx tsx scripts/test-yc30-ui.ts

# 3) Hồi quy YC-23 → YC-32 (API + xuất Excel + quyền)
$env:TEST_BASE_URL="http://localhost:3100"
$env:TEST_LEADER_USER="<tài khoản lãnh đạo>"; $env:TEST_LEADER_PASS="<mật khẩu>"
$env:TEST_STAFF_USER="<tài khoản cán bộ>";  $env:TEST_STAFF_PASS="<mật khẩu>"
npx tsx scripts/test-yc30-regression.ts
```

Mật khẩu Production đọc từ `demo-ops/demo-secrets.json` (nằm ngoài Git) hoặc qua biến môi trường `TEST_*_PASS` — **không ghi mật khẩu vào mã nguồn hay tài liệu**.
