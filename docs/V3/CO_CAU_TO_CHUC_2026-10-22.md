# CHUẨN HOÁ CƠ CẤU TỔ CHỨC + SỐ LIỆU GIAO DIỆN — 22/10/2026

**Yêu cầu của chủ dự án (22/10/2026):** sửa lại giao diện đổi mật khẩu · chuẩn hoá cấp của cơ cấu tổ chức · sửa giao diện đăng nhập cho khớp số liệu và đúng đơn vị (**Chi cục hải quan khu vực XVI → Hải quan cửa khẩu quốc tế Tà Lùng**, **6 nhóm nghiệp vụ**, **348 đầu công việc thường xuyên**).

**Mã triển khai:** `5e673f3` (cây cơ cấu + mapping) → commit giao diện sau đó · **Production:** `https://task-cus.vercel.app`

---

## 1. Cây cơ cấu tổ chức chuẩn hoá (đã ghi vào Production)

```
C1  Chi cục hải quan khu vực XVI                     [HQCB-CHI-CUC-HQKV-XVI]
 └─ C2  Hải quan cửa khẩu Quốc tế Tà Lùng            [HQCB-HAI-QUAN-CUA-KHAU-QUOC-TE-TA-LUNG]
     ├─ C3  Lãnh đạo đơn vị                         [HQCB-LANH-DAO-DON-VI]
     ├─ C3  Bộ phận Nghiệp vụ Hải quan               [HQCB-BO-PHAN-NGHIEP-VU-HAI-QUAN]
     ├─ C3  Bộ phận CNTT                            [HQCB-BO-PHAN-CNTT]
     ├─ C3  Bộ phận điều tra CBL                    [HQCB-BO-PHAN-DIEU-TRA-CBL]
     ├─ C3  Bộ phận Phúc tập & KT STQ               [HQCB-BO-PHAN-PHUC-TAP-KT-STQ]
     ├─ C3  Bộ phận TH & Báo cáo                    [HQCB-BO-PHAN-TH-BAO-CAO]
     └─ C3  Bộ phận Công tác Đảng                   [HQCB-BO-PHAN-CONG-TAC-DANG]
```

* Trước đó: **8 đơn vị đều cấp 1, không có quan hệ cha–con, sort_order = 0** → cây đơn vị không đúng cấp bậc hành chính.
* Sau khi chuẩn hoá: `level` 1/2/3 đúng, `parent_id` đúng, `sort_order` 10→70 theo thứ tự file Excel "Cơ cấu tổ chức".
* **Đã kiểm chứng qua app**: `GET /api/org-units/tree` trả về đúng cây 3 cấp (1 → 1 → 7).
* Script tái lập được: `scripts/standardize-org-structure.mjs` (dry-run mặc định, idempotent) **và** đã ghi kèm vào `scripts/reset-and-init.mjs` để lần reset sau sinh ra đúng cơ cấu này.

## 2. Mapping 6 nhóm công việc thường xuyên ↔ 6 bộ phận (đóng blocker B-2)

| Nhóm công việc thường xuyên (TX) | Số đầu việc | Đơn vị tổ chức | Trạng thái |
|---|---|---|---|
| Bộ phận Nghiệp vụ Hải quan | 146 | Bộ phận Nghiệp vụ Hải quan | MAPPED · active |
| Bộ phận TH & Báo cáo | 102 | Bộ phận TH & Báo cáo | MAPPED · active |
| Bộ phận điều tra CBL | 57 | Bộ phận điều tra CBL | MAPPED · active |
| Bộ phận Công tác Đảng | 8 | Bộ phận Công tác Đảng | MAPPED · active |
| Bộ phận CNTT | 5 | Bộ phận CNTT | MAPPED · active |
| Bộ phận Phúc tập & KT STQ | 2 | Bộ phận Phúc tập & KT STQ | MAPPED · active |

* Đã sửa lỗi chính tả trong tên nhóm lấy từ file nguồn: **“Bộ phân Nghiệp vụ Hải quan” (146 dòng) → “Bộ phận Nghiệp vụ Hải quan”**, **“Bộ phận công tác Đảng” → “Bộ phận Công tác Đảng”** → 6 nhóm khớp 1:1 với 6 bộ phận.
* `work_catalog_department_mappings`: trước **0 dòng** (chưa xác nhận) → sau **6 dòng `is_active = true`**, có `confirmed_by`/`confirmed_at`; app hiển thị `mappingState: MAPPED` ✔.
* **Lưu ý vận hành:** phiên bản TX đang để `selectionMode = ALL` → mọi cán bộ vẫn chọn được đầu việc của cả 6 nhóm. Muốn giới hạn theo bộ phận thì đổi sang `MAPPED`, **nhưng phải gán đơn vị cho 6 HĐLĐ + quyết định nhóm cho “Lãnh đạo đơn vị”** trước, nếu không các nhóm đó sẽ không chọn được đầu việc.

## 3. Giao diện

| Màn hình | Thay đổi |
|---|---|
| `/login` | Thương hiệu 2 cấp: **Chi cục hải quan khu vực XVI** → **Hải quan cửa khẩu Quốc tế Tà Lùng**; số liệu **“6 nhóm nghiệp vụ và 348 đầu công việc thường xuyên”** (thay “5 nhóm nghiệp vụ và 48 hoạt động mẫu”); thẻ tính năng “6 nhóm nghiệp vụ chuẩn theo cơ cấu tổ chức”; footer ghi rõ 2 cấp đơn vị |
| `/change-password` | Viết lại theo design system (token màu/chữ, card, input, nút) + thương hiệu 2 cấp như trang đăng nhập; **không còn bị sidebar/header bọc** (AppShell loại trừ `/change-password`) |
| Sidebar / Header | Thương hiệu: “Hải quan cửa khẩu Tà Lùng” + “Chi cục hải quan khu vực XVI” |
| `/plans` | Cảnh báo “chưa phân vào **6** nhóm nghiệp vụ quy chuẩn” |

**Kiểm chứng giao diện (HTML do server render):** đủ “Chi cục hải quan khu vực XVI”, “Hải quan cửa khẩu Quốc tế Tà Lùng”, “6 nhóm nghiệp vụ”, “348 đầu công việc thường xuyên”; **không còn** “5 nhóm nghiệp vụ” / “48 hoạt động mẫu” ✔.

## 4. Số liệu dùng trên giao diện — nguồn

| Con số | Nguồn | Ghi chú |
|---|---|---|
| 6 nhóm nghiệp vụ | 6 bộ phận trong cây tổ chức = 6 nhóm TX | khớp 1:1 |
| 348 đầu công việc thường xuyên | File Excel “Danh mục công việc” (348 dòng) | Hệ thống đang lưu **320 mã** đã đối chiếu (348 − 28 dòng trùng) — con số 348 là của file nguồn chính thức |
| 35 cán bộ | File “Danh sách” | 29 công chức + 6 HĐLĐ (đã cấp tài khoản 22/10/2026) |

## 5. Việc còn lại

| # | Việc | Ghi chú |
|---|---|---|
| 1 | 6 HĐLĐ chưa gán đơn vị | Cần quyết định bộ phận → gán đơn vị (có thể làm qua màn hình Tổ chức hoặc script) |
| 2 | “Lãnh đạo đơn vị” chưa có nhóm TX riêng | Nếu chuyển `selectionMode` sang MAPPED thì phải xử lý trước |
| 3 | Tuyến phê duyệt (`person_supervisions = 0`) | Chưa gán tuyến duyệt kế hoạch cho lãnh đạo/Trưởng nhóm |
| 4 | Đính kèm tệp | Vẫn 404 do khoá `SUPABASE_SECRET_KEY` trên Vercel không gọi được Storage API |
