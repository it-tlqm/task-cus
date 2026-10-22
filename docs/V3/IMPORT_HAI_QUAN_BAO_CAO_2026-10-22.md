# TALUNG-CUS-WORK — ĐỒNG BỘ DỮ LIỆU THẬT HẢI QUAN TÀ LÙNG LÊN PRODUCTION

**Ngày:** 22/10/2026 · **Nguồn:** `docs/Dữ liệu-file-hai-quan-gui/Danh sách.xlsx` (SHA-256 `ab13cac7d39269f9e6287f319ef44c6534cc17fa9cb650a29a17c8c312337651`)
**Công cụ:** `scripts/import-hai-quan-data.mjs` (dry-run/apply) · `scripts/pg-backup-restore.mjs` (backup/restore độc lập schema)
**Production:** commit `d524576` (không thay đổi mã nguồn) · DB: Supabase pooler · **không deploy V3, không merge `main`**

---

## 1. KẾT QUẢ 5 GATE

| Gate | Kết quả | Bằng chứng |
|---|---|---|
| **1 — Kiểm kê & đối soát (chỉ đọc)** | ✅ PASS | Dry-run: `docs/V3/import-hai-quan-dryrun.json`. Production: 8 org_units · 38 persons · 24 accounts · 348 TX · 32 work items · 23 tasks · 15 monthly results · 1477 audit |
| **2 — Backup & restore-test** | ✅ PASS | Backup Production **74 bảng / 7.575 bản ghi / 3.869.681 bytes / sha256 `a947eb90…`** (lưu `demo-ops/yc38c-backup/prod-20261022-…-pre-import.json`). Restore vào DB scratch riêng `talung_import_test`: **7.575 dòng, 0 bảng thiếu**, số lượng khớp Production. Import thử **lần 1** (3 đơn vị, 1 nhân sự, 27 phân công) → **lần 2: 0 thay đổi** ⇒ idempotent |
| **3 — Đồng bộ dữ liệu an toàn** | ✅ PASS | Đã ghi Production (idempotent, có nhật ký). **0** tài khoản mới, **0** đổi/reset mật khẩu, **0** cấp role, **0** xoá bản ghi, **0** thay đổi hệ số TX/sản phẩm QĐ1277 |
| **4 — Kiểm tra sau nhập** | ✅ PASS | Số lượng đối chiếu với backup; 8 API Production trả **HTTP 200, không 5xx**; danh mục QĐ1277 nguyên vẹn; lịch sử nguyên vẹn |
| **5 — Manifest dữ liệu DEMO** | ✅ PASS | `docs/V3/demo-data-manifest.json` (chỉ lập danh sách, **không** xoá/ngừng) |

---

## 2. DỮ LIỆU ĐÃ NHẬP THẬT LÊN PRODUCTION

| Nhóm | Tạo mới | Cập nhật | Bỏ qua / giữ nguyên |
|---|---|---|---|
| **Đơn vị (org_units)** | **3** — `HQCB-BO-PHAN-CNTT`, `HQCB-BO-PHAN-DIEU-TRA-CBL`, `HQCB-BO-PHAN-CONG-TAC-DANG` | **2** đổi tên theo Excel (giữ nguyên mã): `BP_NGHIEPVU_A` → *Bộ phận Nghiệp vụ Hải quan*; `BỘ PHẬN PHÚC TẬP _ KTSTQ` (tên cũ *Tổng hợp*) → *Bộ phận Phúc tập & KT STQ* | 5 đơn vị cũ không có trong Excel **giữ nguyên** (lịch sử): `BP_TONDONG_C`, `BP_GIAMSAT_B`, `BP_TONGHOP_D`, `KT_MGH_03` |
| **Nhân sự (people)** | **1** — `HQ-LEVANHAU` (Lê Văn Hậu, Phó trưởng HQ khu vực) — **không tạo tài khoản** | 34 hồ sơ cập nhật email/điện thoại từ Excel (định danh khớp **họ tên đầy đủ**; không có tài khoản nào bị ghi đè) | 1 người ngoài đơn vị cửa khẩu (Lê Văn Hậu) — **không gán đơn vị** (cấp trên Hải quan khu vực) |
| **Phân công (person_assignments)** | **27** lượt (gồm 6 người kiêm nhiệm 2–3 bộ phận) | 9 lượt cũ được "mở lại" (hiệu lực lại) | 6 người *Hợp đồng lao động 111* — **không gán đơn vị** (không phải bộ phận nghiệp vụ) |
| **Danh mục TX** | 0 | 0 | 348 mục **giữ nguyên**: 316 khớp tuyệt đối với Excel · 28 dòng trùng trong chính file Excel (bỏ qua) · **4 mã có hệ số khác Excel → giữ hệ số đang vận hành, chờ quyết định** |
| **Sản phẩm QĐ1277** | 0 | 0 | 3.386 sản phẩm + 80 nhóm nguyên vẹn |
| **Tài khoản / Role / Mật khẩu** | **0** | **0** | 24 tài khoản, 25 role_grants, toàn bộ mật khẩu **không đổi** |
| **Lịch sử** | 0 | 0 | 32 work items · 23 tasks · 15 monthly results · 177 thông báo · 1477 audit — nguyên vẹn (+1 audit import = 1478) |

**Nhật ký import trong CSDL:** `audit_events` action `DATA_IMPORT_HAI_QUAN` @ `2026-10-22T03:02:37Z`, `newData = {source:"Danh sách.xlsx", checksum:"ab13cac7…", counts:{units:3, persons:1, assignments:27, txFactors:0, txNew:0}}`; manifest chi tiết: `docs/V3/import-hai-quan-manifest-*.json`.

---

## 3. DANH SÁCH CẦN QUYẾT ĐỊNH (không tự xử lý)

| # | Vấn đề | Chi tiết | Đề xuất |
|---|---|---|---|
| **B-1** | **Đơn vị "Bộ phận TH & Báo cáo"** (Excel) có thể trùng `BP_TONGHOP_D` *"Bộ phận Tổng hợp & Báo cáo D"* (độ tương đồng 70%) | Không tạo đơn vị mới để tránh trùng | Xác nhận có phải cùng một bộ phận không → nếu có thì **đổi tên** `BP_TONGHOP_D` theo Excel và gán phân công của 4 người (Trần Minh Hoàng, Lý Thị Hương, Lâm Nhật Anh, Nguyễn Tuấn Anh) |
| **B-2** | **4 mã TX có hệ số khác Excel** | `NV-117` Production 2 / Excel 2,04 · `NV-173` 6 / 1 · `NV-134` 2 / 1 · `NV-172` 6 / 1 | Xác nhận hệ số đúng theo Quyết định 1277 → cập nhật hoặc giữ |
| **B-3** | **6 người "Hợp đồng lao động 111"** chưa có đơn vị | Không phải bộ phận nghiệp vụ (đúng yêu cầu) | Quyết định gắn vào đơn vị nào hoặc để ngoài hệ thống nghiệp vụ |
| **B-4** | **Lê Văn Hậu** (Phó trưởng Hải quan khu vực) | Đã tạo hồ sơ, chưa gán đơn vị, chưa có tài khoản | Xác nhận có thuộc Hải quan cửa khẩu không |
| **B-5** | **Lãnh đạo trực tiếp (A1)** chưa khai báo | Không tự gán từ chức danh | Khai báo `person_supervisions` cho *Trưởng nhóm* theo từng bộ phận (Nguyễn Hải Yên, Nguyễn Đình Giang, Hoàng Văn Huynh, Trần Minh Hoàng) — **chưa ghi gì cả** |
| **B-6** | **4 người đầu danh sách** | 3 người đã gán "Lãnh đạo đơn vị"; **không** mặc định là lãnh đạo trực tiếp của cửa khẩu | Xác nhận 1 Trưởng + 2 Phó (tiêu đề Excel ghi cả 3 là "Phó trưởng") |
| **B-7** | **Tài khoản đăng nhập cho nhân sự thật** | **Không** tạo/gửi tài khoản cho 39 người (đúng ràng buộc) | Chủ dự án quyết định cơ chế cấp tài khoản (kích hoạt `cb0xx` hiện có hay cấp mới) |

---

## 4. DỮ LIỆU DEMO ĐANG TỒN TẠI (Gate 5 — chỉ lập manifest, **chưa** xoá/ngừng)

`docs/V3/demo-data-manifest.json`. Phân loại chính xác:

| Nhóm | Tài khoản | Dữ liệu liên kết | Đề xuất |
|---|---|---|---|
| **DEMO thật** | `democb01`, `democb02`, `demold01`, `testacc` (HQT) | 8 + 6 + 3 đầu việc · **15 kết quả tháng** (8+6+1) · 14 nhiệm vụ | Có thể **ẩn/ngừng** sau khi chủ dự án xác nhận; **giữ** 15 kết quả tháng nếu cần bảo toàn lịch sử báo cáo |
| **Tài khoản của nhân sự THẬT** (tạo từ YC-31/32) | `cb001`…`cb020`, `cb0018`, `dantn` (19 tài khoản) | cb015 có 14 đầu việc · cb006 1 · các tài khoản khác có nhiệm vụ | **KHÔNG** coi là DEMO — giữ nguyên; cần chủ dự án quyết định mật khẩu/kích hoạt |
| **Dữ liệu lịch sử bắt buộc giữ** | 15 monthly results · 32 work items · 23 tasks · 5 plans · 177 notifications · 1.478 audit events · 348 TX · 3.386 SP | | Không xoá |

---

## 5. ĐƯỜNG DẪN GIAO DIỆN ĐỂ CHỦ DỰ ÁN KIỂM TRA

| Kiểm tra | Đường dẫn | Kỳ vọng |
|---|---|---|
| Sức khoẻ hệ thống | `https://task-cus.vercel.app/api/health` | `status=ok`, `db=up`, `commit=d524576` |
| Cơ cấu tổ chức | `/admin/organization` | 11 đơn vị: 6 bộ phận theo Excel + HQCK + Lãnh đạo đơn vị + 3 đơn vị cũ (giữ lịch sử) |
| Danh sách cán bộ | `/roster` | 39 hồ sơ; kiểm tra **Lê Văn Hậu**, các bộ phận mới (CNTT, điều tra CBL, Công tác Đảng) |
| Quan hệ kiêm nhiệm | `/admin/supervisions` | 6 người ở 2–3 bộ phận: Hà Thị Dung, Trương Hồng Thắng, Trần Minh Hoàng, Lý Thị Hương, Lâm Nhật Anh, Nguyễn Tuấn Anh |
| Danh mục TX | `/admin/catalog` | 348 mục, 6 nhóm, không trùng mới; hệ số giữ nguyên |
| Danh mục SP QĐ1277 | `/admin/catalog` (tab sản phẩm) | 3.386 sản phẩm nguyên vẹn |
| Đăng nhập & phân quyền | `/login` (tài khoản `cb0xx`/`dantn` — mật khẩu do chủ dự án quản lý) | 24 tài khoản, 25 role_grants không đổi |

---

## 6. PHƯƠNG ÁN ROLLBACK

| Bước | Cách làm |
|---|---|
| 1 | **Khôi phục toàn bộ**: `node scripts/pg-backup-restore.mjs restore --db=<url Production> --file=demo-ops/yc38c-backup/prod-20261022-…-pre-import.json` (bản sao đã kiểm chứng ở Gate 2) |
| 2 | **Hoặc hoàn tác có chọn lọc** (theo manifest): xoá 3 org_unit mã `HQCB-BO-PHAN-*` · xoá 1 person `HQ-LEVANHAU` · xoá 27 person_assignment mới (hiệu lực 2026-01-01, đơn vị mới) · hoàn tác 9 lượt phân công đã "mở lại" · trả tên 2 đơn vị về tên cũ · trả email/điện thoại 34 hồ sơ từ bản sao |
| 3 | Xoá 1 bản ghi audit `DATA_IMPORT_HAI_QUAN` (nếu cần trả trạng thái hoàn toàn) |
| 4 | Không cần rollback mã nguồn (không có thay đổi mã trên `main`) |
| 5 | Bản sao backup được giữ tại `demo-ops/yc38c-backup/` (gitignored) — **không xoá** |

**Xác nhận an toàn:** không có thao tác xoá cứng, không đổi/reset mật khẩu, không cấp quyền nghiệp vụ, không thay thế người phê duyệt, không ghi đè hệ số TX hay sản phẩm QĐ1277, không merge/deploy V3 lên Production.
