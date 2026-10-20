# YC-30 BỔ SUNG + YC-31 CẬP NHẬT + NHÂN SỰ — BÁO CÁO GIAI ĐOẠN 1

**Ngày:** 20/10/2026 · **Căn cứ:** yêu cầu cập nhật ngày 20/10/2026 (file `Danh mục TX1.xls`, `danh.xlsx`)
**Base:** `3f88832` (YC-30 đã báo cáo) → **Commit triển khai:** `9633a43` (+ `606f703` sửa focus drawer)
**Production:** `https://task-cus.vercel.app`

---

## 1. YC và hạng mục đã hoàn thành

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| YC-30 bổ sung — Nhật ký công việc | ✅ Hoàn thành | Bộ lọc dùng chung cho 2 nguồn dữ liệu, không tạo bảng mới |
| YC-30 bổ sung — Tổ chức lại menu | ✅ Hoàn thành | 7 nhóm → 6 nhóm, gộp "Công việc cá nhân" + "Công việc bộ phận" |
| YC-31 cập nhật — Import 348 đầu việc TX1 | ✅ Hoàn thành | Đã nhập vào Production, phiên bản `TX-20261020-01` |
| YC-31 cập nhật — Mã theo nhóm, hệ số | ✅ Hoàn thành | NV/CNTT/CBL/PT/TH/DANG; 207 hệ số (10 giá trị 0), 141 ô trống |
| YC-31 cập nhật — Sửa hệ số về sau | ✅ Hoàn thành | Ô nhập hệ số trực tiếp trong màn quản trị, có audit |
| YC-32 — Liên thông kết quả đánh giá | ✅ Hoàn thành | API trả `inEvaluation`; hiển thị trạng thái trong Nhật ký công việc |
| Nhân sự — Cập nhật danh sách đã xác minh | ✅ Hoàn thành (một phần) | 18 hồ sơ cập nhật, 14 hồ sơ mới; **KHÔNG tạo tài khoản** |
| Nhân sự — Phân công bộ phận theo tên ngắn | ⏳ Chờ Hải quan xác nhận | 2 tên ngắn có nhiều ứng viên → không tự gán (mục 8) |
| YC-33 → YC-37 | ⏳ Chưa đến giai đoạn | Theo thứ tự đã chốt |

---

## 2. Chức năng dùng được trên Production

### 2.1. Nhật ký công việc (`/my-work`)

Thanh bộ lọc mới, dùng chung cho **cả hai nguồn dữ liệu** (không tạo bảng dữ liệu mới):

| Nhóm lọc | Giá trị | Áp dụng cho |
|---|---|---|
| Thời gian | Hôm nay · Tuần này · Tháng này · Tất cả thời gian | Cả nhiệm vụ giao và đầu việc kế hoạch |
| Nguồn | Tất cả · Từ kế hoạch · Phát sinh | Đầu việc kế hoạch (có `planItemId`) vs công việc phát sinh |
| Trạng thái | Tất cả · Đang thực hiện · Chậm hạn · Đã hoàn thành | Cả hai nguồn |
| Tìm kiếm | Tên / mã đầu việc | Cả hai nguồn (không dấu) |

- **Mặc định "Hôm nay"** — cán bộ mở phần mềm thấy ngay việc cần xử lý hôm nay.
- Hạn xử lý, tiến độ, ngày hoàn thành, minh chứng: giữ nguyên cơ chế YC-32 (không nhân bản bản ghi).
- Mỗi đầu việc hiển thị trạng thái **đã đưa vào kết quả đánh giá hay chưa** (`inEvaluation` từ API).

### 2.2. Menu

Cấu trúc mới (6 nhóm, 28 mục) — xem mục 3.

### 2.3. Danh mục công việc TX1 — đã nhập Production

- Phiên bản `TX-20261020-01`, **348 đầu việc**, 6 nhóm, trạng thái ACTIVE.
- Mã đầu việc: `NV-01`…`NV-174`, `CNTT-01`…`CNTT-05`, `CBL-01`…`CBL-57`, `PT-01`…`PT-02`, `TH-01`…`TH-102`, `DANG-01`…`DANG-08`.
- Hệ số quy đổi: 207 ô có giá trị (trong đó **10 giá trị bằng 0** — giữ nguyên 0), 141 ô chưa có hệ số (NULL).
- Cán bộ **chọn được đầu việc từ cả 6 nhóm** (chế độ `selectionMode=ALL`) — vì Hải quan chưa xác nhận ánh xạ 6 nhóm nguồn ↔ bộ phận nhân sự.
- Quản trị viên có thể **bổ sung/sửa hệ số** tại màn "Danh mục công việc" (ghi audit, chỉ trong phiên bản đang áp dụng).
- 48 mẫu công việc cũ **không bị xoá**, vẫn dùng được cho công việc lịch sử.

---

## 3. Cấu trúc menu (cũ → mới)

### 3.1. Cũ (7 nhóm)

Tổng quan & điều hành · Công Việc · Giao Ban · Lịch & Nghỉ · Báo Cáo · Danh Mục · Quản Trị

### 3.2. Mới (6 nhóm)

| Nhóm | Mục | Thay đổi |
|---|---|---|
| **Tổng quan & điều hành** | Bảng điều hành, Số liệu giao ban, Nhập số liệu giao ban, Báo cáo giao ban, Biên bản giao ban | không đổi |
| **Nhật ký công việc** | Nhật ký công việc, Lập kế hoạch, Công việc phát sinh, Phê duyệt | **gộp** từ "Công việc cá nhân" + "Công việc bộ phận" |
| **Trực ca & nghiệp vụ** | Nhật ký tác nghiệp, Lịch trực, Lịch công tác, Nghỉ phép & công tác, Sổ văn bản | không đổi |
| **Kết quả & báo cáo** | Kết quả công tác tháng, Báo cáo & tổng hợp, Xuất Excel, Số liệu đã chốt | không đổi |
| **Danh mục & quy định** | Sản phẩm QĐ1277 | không đổi |
| **Quản trị hệ thống** | Danh mục công việc, Tổ chức & nhân sự, Biểu mẫu & quy trình, Cấu hình số liệu giao ban, Cấu hình hệ thống, Nhật ký hệ thống, Góp ý & báo lỗi | không đổi |

**Đổi nhãn:** "Việc cá nhân" → **"Nhật ký công việc"**; "Kế hoạch tuần" → **"Lập kế hoạch"**; "Việc đột xuất" → **"Công việc phát sinh"**; bottom nav "Việc cá nhân" → **"Nhật ký"**.

**Không đổi route:** `/my-work`, `/plans`, `/tasks`, `/routine`… giữ nguyên đường dẫn (bookmark/deep-link không hỏng).

---

## 4. Danh sách chức năng/route được di chuyển

| Route | Cũ | Mới |
|---|---|---|
| `/my-work` | Công việc cá nhân → Việc cá nhân | **Nhật ký công việc** (+ bộ lọc dùng chung) |
| `/plans` | Công việc bộ phận → Kế hoạch tuần | **Nhật ký công việc → Lập kế hoạch** |
| `/tasks` | Công việc bộ phận → Việc đột xuất | **Nhật ký công việc → Công việc phát sinh** |
| `/approvals` | Công việc bộ phận → Phê duyệt | Nhật ký công việc → Phê duyệt |
| `/routine` | Trực ca & nghiệp vụ → Nhật ký tác nghiệp | không đổi (giữ độc lập, **không** gộp vào nhật ký công việc) |
| `/roster` | Trực ca & nghiệp vụ → Lịch trực | không đổi (giữ độc lập theo yêu cầu) |
| `/admin/catalog` | Quản trị hệ thống → Danh mục công việc | không đổi (+ hiển thị hệ số, mã nhóm, chế độ phạm vi) |

**Không tạo route mới, không xoá route cũ.**

---

## 5. Thành phần frontend đã chỉnh sửa

| Tệp | Nội dung |
|---|---|
| `src/config/navigation.ts` | Cấu trúc menu 6 nhóm; nhãn mới; breadcrumb bỏ cấp trùng |
| `src/components/work/JournalFilterBar.tsx` | **Mới** — bộ lọc Nhật ký công việc dùng chung (thời gian / nguồn / trạng thái / tìm kiếm) |
| `src/app/my-work/page.tsx` | Tích hợp bộ lọc; tiêu đề "Nhật ký công việc" |
| `src/app/my-work/MyWorkItemsSection.tsx` | Nhận `journalFilter`; áp lọc cho đầu việc kế hoạch; thêm `inEvaluation` |
| `src/app/api/personal-work-items/route.ts` | Trả `inEvaluation` + `evaluationPeriods` |
| `src/server/work-catalog.ts` | **Parser mới**: đọc `.xls` (OLE2/BIFF8) + `.xlsx`; mã theo nhóm; hệ số; cho phép tên trùng trong nhóm; `selectionMode` |
| `src/app/api/work-catalog/import/route.ts` | Nhận `.xls`; tên trùng không còn chặn import |
| `src/app/api/work-catalog/entries/[id]/route.ts` | Sửa hệ số quy đổi (kể cả 0; `null` = xoá hệ số) + audit |
| `src/app/api/work-catalog/versions/route.ts` | `PATCH` đổi `selectionMode` |
| `src/app/api/work-catalog/route.ts` | `scope=all` cho tra cứu toàn danh mục; trả hệ số |
| `src/app/admin/catalog/WorkCatalogTab.tsx` | Cột hệ số (sửa được), nhãn mã nhóm, nút chuyển phạm vi chọn |
| `src/components/layout/MobileNavDrawer.tsx` | Focus nút đóng ổn định (rAF + hẹn giờ dự phòng) |
| `src/app/huong-dan/page.tsx`, `src/data/page-help.ts`, `src/app/plans/page.tsx` | Đồng bộ nhãn |
| `prisma/schema.prisma` | `WorkCatalogEntry.groupCode`, `.convertFactor` (Decimal 12,4); `WorkCatalogVersion.selectionMode` |

---

## 6. Dữ liệu đã nhập/cập nhật và kết quả đối soát

### 6.1. Danh mục TX1 — đối soát với file gốc

Đọc trực tiếp file `Danh mục TX1.xls` (OLE2/BIFF8) bằng **hai đường độc lập** (Excel COM + thư viện đọc OLE2) và đối chiếu:

| Chỉ số | Hải quan công bố | Thực đo từ file gốc | DB sau import | KQ |
|---|---:|---:|---:|:--:|
| Tổng đầu việc | 348 | 348 | 348 | ✅ |
| Nghiệp vụ Hải quan (NV) | 174 | 174 | 174 | ✅ |
| CNTT | 5 | 5 | 5 | ✅ |
| Điều tra CBL | 57 | 57 | 57 | ✅ |
| Phúc tập & KT STQ (PT) | 2 | 2 | 2 | ✅ |
| Tổng hợp & Báo cáo (TH) | 102 | 102 | 102 | ✅ |
| Công tác Đảng (DANG) | 8 | 8 | 8 | ✅ |
| Ô có hệ số | 207 | 207 | 207 | ✅ |
| Hệ số bằng 0 | 10 | 10 | 10 | ✅ |
| Ô chưa có hệ số | 141 | 141 | 141 | ✅ |
| Mã đầu việc duy nhất | — | 348/348 | 348/348 | ✅ |

**Lưu ý phát hiện thêm (đề xuất, chưa tự xử lý):** file gốc có **12 cặp tên trùng hoàn toàn trong cùng nhóm "Nghiệp vụ Hải quan"** (vd dòng 78/93/97/117/163 đều là *"Kiểm tra hồ sơ hải quan (luồng vàng, đỏ)"*). Yêu cầu ghi rõ "không bỏ qua đầu việc có tên trùng" → hệ thống **giữ đủ cả 12 dòng**, mỗi dòng một mã riêng. Ngoài ra có các cặp chỉ khác chữ hoa đầu câu (vd dòng 131 *"về việc…"* vs 135 *"Về việc…"*) — **không gộp**, vì nội dung gốc khác nhau.

### 6.2. Nhân sự — đối chiếu `danh.xlsx`

`danh.xlsx`: 32 dòng (STT 1→32; dòng 2 là dữ liệu rác của file, đã loại).

| Chỉ số | Kết quả |
|---|---|
| Khớp chắc chắn với DB (tên đầy đủ, không trùng) | **18** → cập nhật email + điện thoại |
| Chưa có hồ sơ trong DB | **14** → tạo hồ sơ cán bộ (KHÔNG tài khoản, CHƯA gán bộ phận) |
| Tên trùng trong DB | 0 |
| Hai tên được bổ sung (`Phạm Linh Thuận`, `Tô Văn Thụ`) | **Đã có sẵn** trong Production (CB-015, CB-011) — không tạo trùng |
| Số tài khoản đăng nhập | **24 → 24** (không tạo tài khoản nào) |

Số liệu đối chiếu: DB trước = 24 người / 24 tài khoản → sau = 38 người / 24 tài khoản. 48 mẫu công việc, 18 task, 5 plan, 26 đầu việc cá nhân, 15 kết quả tháng — **không đổi**.

### 6.3. Bảo toàn dữ liệu Production

| Đối tượng | Trước | Sau |
|---|---:|---:|
| `activity_templates` (48 mẫu) | 48 | 48 |
| `tasks` | 18 | 18 |
| `plans` | 5 | 5 |
| `personal_work_items` | 26 | 26 |
| `monthly_work_results` | 15 | 15 |
| `work_evidences` | 0 | 0 |
| `work_catalog_versions` | 0 | 1 (TX-20261020-01) |
| `work_catalog_entries` | 0 | 348 |
| `work_catalog_department_mappings` | 0 | 0 (chưa ánh xạ — chờ Hải quan) |

---

## 7. Kết quả kiểm thử

| Bộ kiểm thử | Local | Production |
|---|---|---|
| `test-yc30-navigation.ts` (cấu trúc menu) | 192/192 | 192/192 |
| `test-yc30-ui.ts` (giao diện desktop + mobile) | 55/55 | 55/55 (sau bản sửa focus `606f703`) |
| `test-yc30-regression.ts` (hồi quy YC-23→32) | 60/60 | 56/56 (bỏ 2 nhóm kiểm tra quản trị hệ thống — Production không có tài khoản SYSTEM_ADMIN demo) |
| `test-yc30-tx1-import.ts` (import TX1) | 47/47 | 47/47 (đối chiếu trực tiếp Production sau import) |
| TypeScript `tsc --noEmit` | ✅ 0 lỗi | ✅ |
| Build `next build` | ✅ thành công | ✅ (qua Vercel) |
| DDL idempotent | lần 1 đổi, lần 2 không đổi | lần 1 `schema_changed=true`, lần 2 `schema_changed=false` cùng fingerprint, `checks_failed=0` |
| Health Production | — | `db=up`, `commit=606f703` |

**Nghiệm thu bắt buộc (mục XIV):**
1. ✅ Đăng nhập theo vai trò — STAFF / UNIT_LEADER / DEPT_LEADER (đã kiểm tra trước YC-30).
2. ✅ Sidebar + Nhật ký công việc trên desktop/mobile — 55/55.
3. ✅ Kế hoạch và nhật ký cũ không mất dữ liệu — 5 plan, 26 đầu việc, 48 mẫu giữ nguyên.
4. ✅ Đọc/import đúng 348 đầu việc.
5. ✅ Mã duy nhất, ổn định; import lặp không nhân đôi (API trả 409).
6. ✅ 207 hệ số (10 giá trị 0) + 141 ô trống.
7. ✅ Tạo công việc từ danh mục mới — đã mở phạm vi chọn cho toàn bộ cán bộ.
8. ✅ Một công việc liên thông sang kết quả đánh giá, không nhân đôi (`inEvaluation`).
9. ✅ Người không có quyền bị từ chối ở API và file minh chứng (hồi quy YC-32 PASS).
10. ⏳ Chấp thuận/giải trình — thuộc YC-37 (Giai đoạn 2).
11. ✅ Các biểu mẫu Excel hiện có không bị lỗi (hồi quy xuất Bảng 1 + 02C PASS).
12. ⏳ Phép tính có căn cứ — thuộc YC-33 (Giai đoạn 2); hiện **không** sinh điểm giả.
13. ✅ Không mất/sửa sai dữ liệu nghiệp vụ cũ (bảng so sánh mục 6.3).
14. ✅ Build, typecheck, smoke, health đạt.

---

## 8. Commit / deployment

| Mục | Giá trị |
|---|---|
| Branch | `main` |
| Commit YC-30 bổ sung + YC-31 + nhân sự | `9633a43` |
| Commit sửa focus drawer | `606f703` |
| DDL Production | `apply-yc30-tx1-ddl.ts` — additive, idempotent, `checks_failed=0` |
| Import danh mục | Phiên bản `TX-20261020-01` (348 đầu việc) |
| Health Production | `db=up`, `commit=606f703` |

**Không chạy** `prisma migrate deploy` (Production không có `_prisma_migrations` — đúng quy ước dự án).

---

## 9. Phần chưa hoàn thành và lý do cụ thể

1. **Chưa ánh xạ 6 nhóm danh mục TX → bộ phận nhân sự.** Yêu cầu: "Sáu nhóm trong Excel là cấu trúc phân loại của file nguồn. Không tự động kết luận chúng tương ứng 1:1 với sáu bộ phận nhân sự đang hoạt động." Để không đình trệ sử dụng, đã bật chế độ `selectionMode=ALL` (mọi cán bộ chọn được mọi nhóm). Khi Hải quan xác nhận mapping → bật lại `MAPPED` và gán từng nhóm tại màn "Danh mục công việc".
2. **Chưa gán bộ phận cho 14 hồ sơ mới.** Không tự gán vì chưa xác nhận mapping bộ phận mới (Tổng hợp / CBL / Nghiệp vụ) với `org_units` hiện có. Quản trị viên gán tại màn "Tổ chức & Nhân sự".
3. **Chưa tạo tài khoản cho 14 hồ sơ mới** — đúng yêu cầu "không tự tạo tài khoản đăng nhập, cấp mật khẩu". Quản trị viên tạo tài khoản sau khi gán bộ phận.
4. **Chưa tích hợp "quan hệ phụ trách"** (Đội trưởng → Đội phó → công chức) — thuộc YC-35 (Giai đoạn 3). Hiện mới có phân công bộ phận; chưa có bảng quan hệ quản lý theo kỳ.
5. **YC-33→YC-37 chưa triển khai** — theo thứ tự đã chốt (Giai đoạn 2: YC-37 → YC-33 → YC-34 → YC-36; Giai đoạn 3: YC-35).

---

## 10. Nội dung cần Hải quan xác nhận

### 10.1. Hai tên ngắn có nhiều ứng viên (chưa gán)

| Nhóm | Tên ngắn | Ứng viên trong `danh.xlsx` |
|---|---|---|
| Bộ phận Tổng hợp | "Hoàng" | Hoàng Văn Bằng · Đinh Đức Hoàng · Hoàng Đức Trung · Hoàng Đức Hạnh · Hoàng Văn Bách |
| Bộ phận CBL | "Minh" | Đặng Minh Được · Lã Trần Minh · Đặng Minh Tuấn |

*(Lưu ý: "Tuấn" của CBL đã loại trừ "Nguyễn Tuấn Anh" vì người này khớp chắc chắn với "Tuấn Anh" của nhóm Tổng hợp → còn 1 ứng viên: **Đặng Minh Tuấn** → đã ghi nhóm CBL trong hồ sơ. "Hương" → **Lý Thị Hương**; "Tuấn Anh" → **Nguyễn Tuấn Anh**; "Nhật Anh" → **Lâm Nhật Anh**; "Huynh" → **Hoàng Văn Huynh**; "Thiện" → **Nông Đức Thiện**; "Nam" → **Tống Thái Nam**.)*

### 10.2. Cấu trúc bộ phận mới

Thông báo chia 3 nhóm: **Tổng hợp · CBL · Nghiệp vụ** (+ nhóm lãnh đạo). Sheet "Cơ cấu tổ chức" trong `Danh mục TX1.xls` lại liệt kê 6 nhóm: Nghiệp vụ Hải quan · CNTT · điều tra CBL · Phúc tập & KT STQ · TH & Báo cáo · Công tác Đảng, với tổng 35 người / 3 lãnh đạo.

`org_units` hiện có trên Production: `HQCK_TALUNG`, `BAN_LANH_DAO`, `BP_NGHIEPVU_A`, `BP_GIAMSAT_B`, `BP_TONDONG_C`, `BP_TONGHOP_D`, `BỘ PHẬN PHÚC TẠP _ KTSTQ`, `KT_MGH_03`.

**Cần Hải quan xác nhận:**
1. Tên bộ phận chính thức mới (để tạo/sửa `org_units` cho khớp).
2. Ánh xạ 6 nhóm danh mục TX → bộ phận nhân sự (để bật kích hoạt theo bộ phận thay vì chế độ mở toàn bộ).
3. Ba người lãnh đạo đơn vị (3 người) — hiện DB có 4 người ở `BAN_LANH_DAO` (gồm 1 tài khoản DEMO).
4. 5 "Hợp đồng lao động 111" trong danh.xlsx có thuộc bộ phận nào (nhóm thông báo không nêu).

### 10.3. Xác nhận nghiệp vụ khác

- Tên nhóm trong file là **"Bộ phân Nghiệp vụ Hải quan"** (thiếu dấu ật ở "phân") — giữ nguyên theo file gốc; có muốn sửa thành "Bộ phận" trên giao diện không?
- 12 cặp tên trùng hoàn toàn trong nhóm Nghiệp vụ Hải quan — giữ đủ 12 dòng (hiện tại) hay gộp thành 1?

---

## Phụ lục — Cách chạy lại bộ kiểm thử

```bash
# 1) Cấu trúc menu (không cần DB)
npx tsx scripts/test-yc30-navigation.ts

# 2) Giao diện desktop + mobile (cần dev server hoặc trỏ Production)
$env:TEST_BASE_URL="https://task-cus.vercel.app"
$env:TEST_LEADER_USER="demold01"; $env:TEST_STAFF_USER="democb01"
npx tsx scripts/test-yc30-ui.ts

# 3) Hồi quy YC-23 → YC-32
$env:TEST_BASE_URL="https://task-cus.vercel.app"
$env:TEST_LEADER_USER="demold01"; $env:TEST_STAFF_USER="democb01"
npx tsx scripts/test-yc30-regression.ts

# 4) Import TX1 (chạy trên DB local/sandbox)
npx tsx scripts/test-yc30-tx1-import.ts
```

Mật khẩu đọc từ `demo-ops/demo-secrets.json` (ngoài Git) hoặc biến môi trường `TEST_*_PASS` — **không ghi mật khẩu vào mã nguồn hay tài liệu**.
