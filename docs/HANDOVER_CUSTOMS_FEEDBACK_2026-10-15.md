# BÀN GIAO — CẬP NHẬT THEO PHẢN HỒI HẢI QUAN TÀ LÙNG (2026-10-15)
**Triển khai mục tiêu:** https://task-cus.vercel.app/ · **Repo:** `it-tlqm/task-cus`, nhánh `main`

## 1. Tên đơn vị (trước → sau)
| Vị trí | Trước | Sau |
|---|---|---|
| Header banner, login hero, dashboard, admin/system, Excel, snapshot | Chi cục Hải quan Cửa khẩu Quốc tế Tà Lùng | Chi cục Hải quan khu vực XVI - Hải quan cửa khẩu Quốc tế Tà Lùng |
| Fallback tên đơn vị khắp UI | Chi cục Hải quan Tà Lùng / Hải quan Tà Lùng | Hải quan cửa khẩu Quốc tế Tà Lùng |
| Dropdown "all" (Header) | Toàn đơn vị — Hải quan Tà Lùng | Toàn đơn vị - Hải quan cửa khẩu Quốc tế Tà Lùng |
| Cơ quan cấp trên (login hero, DemoBanner) | Tổng cục Hải quan • Cục HQ tỉnh Cao Bằng / Cục Hải quan tỉnh Cao Bằng | Chi cục Hải quan khu vực XVI |
| Hằng số tập trung mới | — | `src/lib/unit-info.ts` (tên chính thức/tắt/quan hệ + nhãn chức danh) |

## 2. Dropdown đơn vị trên Header (7 lựa chọn, dữ liệu thật từ `/api/org-units/tree`)
1. Toàn đơn vị - Hải quan cửa khẩu Quốc tế Tà Lùng (mục ảo `all`, lọc toàn phạm vi)
2. Hải quan cửa khẩu Quốc tế Tà Lùng (bản ghi root `HQCK_TALUNG`, đổi tên)
3. Lãnh đạo đơn vị (bản ghi `BAN_LANH_DAO`, đổi tên từ "Ban Lãnh đạo Đơn vị")
4. Bộ phận Nghiệp vụ A (Thủ tục Hải quan) (giữ nguyên)
5. Bộ phận Kiểm tra giám sát B (Barie & kho, bãi) (đổi tên + chuẩn chữ thường "giám sát")
6. Bộ phận Xử lý nghiệp vụ tồn đọng C (giữ nguyên)
7. Bộ phận Tổng hợp & Báo cáo D (đổi từ "& Đánh giá D")
- Không hardcode: Header render `all` + `flatList` từ API. Không đổi id/code/parentId/quan hệ; không đụng plans/tasks/reports/accounts/snapshots.
- Áp cho DB hiện hữu: `npx tsx scripts/rename-units-official.ts` (dry-run mặc định) → kiểm tra log → chạy lại với `--apply`. Đổi theo CODE ổn định, có log trước/sau để khôi phục.

## 3. Bốn chức danh sau chuẩn hóa (chỉ đổi nhãn, giữ mã Role/Enum và quyền)
| Nhóm | Nhãn mới | Mã backend (không đổi) |
|---|---|---|
| 1 | Trưởng hải quan cửa khẩu | `UNIT_LEADER` (+ position `CHIEF`/`CHI_CUC_TRUONG`) |
| 2 | Trưởng bộ phận | `DEPARTMENT_LEADER` |
| 3 | Công chức | `STAFF` |
| 4 | Quản trị hệ thống | `SYSTEM_ADMIN` |
- Áp dụng: Header badge (`getRoleBadgeLabel` nay ánh xạ đúng mã thật — trước đây rơi vào "Cán bộ tác nghiệp"), trang audit, fallback API people, `ROLE_DISPLAY_NAMES` tập trung, seed role/position names, migration script.
- Quyết định: khối demo 1-chạm đã xóa khỏi login (§4) nên 4 nhãn không còn liệt kê ở login; nếu Hải quan muốn danh sách tĩnh 4 nhóm trên login sẽ bổ sung.

## 4. DEMO đã loại bỏ khỏi giao diện công khai
- Xóa toàn bộ khối "Tài khoản UAT / Vận hành thực tế (1-Chạm)" + 4 thẻ chọn nhanh (`hqtl001/hqtl011/hqtl014/admin`) + hint `demo: demo123` + gợi ý `lanhdao, canbo_a` + badge "MÔI TRƯỜNG THIẾT KẾ — DỮ LIỆU DEMO" + toàn bộ `isDemoMode/fillDemoAccount` (trang login chỉ còn form thật).
- Làm sạch thuật ngữ kỹ thuật nội bộ ở hero login (Stitch/ExcelJS/Formula Injection/Scope Guard/SHA-256 → lời lẽ nghiệp vụ).
- Không xóa: tài khoản/nhiệm vụ/DB, danh mục 48 mẫu, snapshot đã chốt. Placeholder "Ví dụ:" trong ô nhập liệu giữ nguyên (gợi ý nhập liệu thường, không phải demo data).
- Bảo mật: không còn credential nào hardcode/hiển thị ở frontend (xác minh bằng grep `demo123|Talung@2026|Tài khoản UAT` trong `src/` → 0 kết quả sau sửa; backend vẫn đọc từ DB/bcrypt như cũ). Tài khoản UAT thật cấp qua kênh riêng, không commit.

## 5. Logo Hải quan Việt Nam
- File: `public/images/logo-haiquan.png` (PNG 22,9 KB, do đơn vị cung cấp).
- Gắn tại: hero login (desktop + mobile), header desktop (cạnh breadcrumb), mobile topbar, favicon (`layout.tsx` metadata + đổi title).
- Nếu đơn vị yêu cầu gỡ/thay logo (bản quyền nhận diện), chỉ cần thay 1 file, không sửa code.

## 6. File đã sửa
`src/lib/unit-info.ts` (mới), `Header.tsx`, `DemoBanner.tsx`, `login/page.tsx`, `layout.tsx`, `dashboard/reports/plans/tasks*/my-work/routine/approvals/admin/*` (nhãn), `server/system-config.ts` + `server/snapshots.ts` + `api/reports/export/route.ts` (tên đơn vị), `api/people/route.ts` + `admin/audit` (fallback chức danh), `prisma/seed.ts` (tên đơn vị/chức danh seed), `scripts/seed-production-officers.ts` (titles), `scripts/rename-units-official.ts` (mới), `scripts/capture-login-screens.ts` (mới), `public/images/logo-haiquan.png` (mới).

## 7. Build & kiểm thử
- `tsc --noEmit`: PASS (exit 0). `next build`: PASS (exit 0, 45/45 routes).
- Trình duyệt thật (Brave headless + production build local): login desktop + mobile chụp tại `docs/screenshots/login-desktop.png`, `login-mobile.png` — đã xác minh: đúng tên chính thức, có logo, không còn demo/UAT.
- Chưa kiểm được ở local (không có DB sống): đăng nhập tài khoản thật, dropdown 7 đơn vị lọc dữ liệu thật, phân quyền — phải kiểm trên Vercel sau deploy + chạy migration rename.

## 8. Git checkpoint
- Commit `c5521be` trên nhánh `main` (60 files, +3125/-271), remote `origin` = `git@github.com-company:it-tlqm/task-cus.git` (khớp tên Vercel `task-cus`).
- Push remote: **ĐÃ PUSH thành công** (`f3daeca..c5521be main -> main`). Nếu Vercel Project đã nối GitHub auto-deploy, bản mới sẽ tự build.

## 9. Trạng thái Vercel — ĐÃ PUSH, CHƯA XÁC MINH DEPLOY (cần bạn kiểm tra dashboard)
1. Không có `.vercel/` link và không có quyền/token Vercel trong môi trường này → **không xác minh được Vercel Project nào đang phục vụ `task-cus.vercel.app`**.
2. Code đã lên `origin/main`. Nếu Vercel đã nối GitHub auto-deploy → bản mới sẽ tự build; nếu không, bạn chạy `vercel --prod` từ máy đã link hoặc bấm Deploy trên dashboard.
3. Sau deploy: chạy migration rename trên DB production (`npx tsx scripts/rename-units-official.ts` dry-run trước, rồi `--apply`), kiểm tra URL thật theo checklist §6 (login, dropdown 7 đơn vị, phân quyền), rồi mới báo hoàn thành. **Tuyệt đối không reset dữ liệu production.**
4. Lưu ý: tài khoản UAT thật cấp qua kênh riêng, không commit (khoản mục §4 trong yêu cầu gốc).
