# YC-38 — BÁO CÁO BÀN GIAO SỬA LỖI UAT (3 VẤN ĐỀ)

**Dự án:** TALUNG-CUS-WORK · **Ngày:** 21/10/2026
**Commit triển khai:** `59adb01` · **Production:** https://task-cus.vercel.app — `{"status":"ok","db":"up","commit":"59adb01"}`
**Trạng thái:** sửa xong, đã deploy, đã smoke trên Production · **UAT nghiệp vụ: CHỜ người kiểm thử xác nhận lại**

---

## 1. ROOT CAUSE & FILE ĐÃ SỬA

### Lỗi 1 — Mã TX không hiển thị → **LỖI UI (dữ liệu đã lưu đúng)**

| Bước | Nguyên nhân | File đã sửa |
|---|---|---|
| Form → DB | ✔ Đúng — `tasks.work_item_id` → `personal_work_items.catalog_entry_id` → `work_catalog_entries` (`NV-01`, `NV-02`, version `TX-20261020-01` ACTIVE) | — |
| DB → API | ❌ API không trả thông tin TX | `src/app/api/tasks/route.ts` (list: thêm `include workItem.catalogEntry` + trường `txSource`)<br>`src/app/api/tasks/[id]/route.ts` (chi tiết: thêm `txSource`) |
| API → UI | ❌ Bảng danh sách hard-code `TTHQ-ĐT`; drawer chi tiết không có khối nguồn | `src/app/my-work/page.tsx` (cột "NGUỒN & DANH MỤC" + drawer)<br>`src/app/tasks/page.tsx` (cột "NGUỒN GIAO VIỆC")<br>`src/app/tasks/[id]/page.tsx` (khối "Nguồn công việc")<br>`src/components/work/TxSourceBadge.tsx` (**mới**) |

- Đã **bỏ** đoạn hard-code `task.code.startsWith("NV-") ? "TTHQ-ĐT" : task.code`.
- Dữ liệu lịch sử chưa xác định nguồn → hiện **"Chưa xác định nguồn"**, **không** tự gán nhóm/mã TX.
- Mã nhiệm vụ (`NV-2026-0016`) và mã danh mục (`NV-01`) hiển thị **riêng biệt**, đúng ý nghĩa.
- Hệ số: `NULL` → **"Chưa có hệ số"**; `0` → hiện **0**. **Không** tính điểm ở tầng hiển thị.

### Lỗi 2 — Lệch +7 giờ → **LỖI LƯU DỮ LIỆU (form/payload)**

| Bước | Nguyên nhân | File đã sửa |
|---|---|---|
| Form → payload | ❌ `currentDeadline: \`${newTaskDeadline}T${newTaskTime}:00Z\`` — gắn `Z` ⇒ coi giờ VN là UTC | `src/app/my-work/page.tsx` (tạo mới, sửa) |
| Payload → API | ✔ API không đổi đổi (chỉ `new Date(iso)`) | — |
| API → DB | ❌ lưu `2026-10-30T17:00:00.000Z` thay vì `…T10:00:00.000Z` | — |
| DB → UI | ✔ hiển thị đúng theo giờ máy người dùng, nhưng vì dữ liệu sai nên ra `31/10 00:00` | `src/app/my-work/page.tsx`, `src/app/tasks/page.tsx`, `src/app/tasks/[id]/page.tsx`, `src/app/approvals/ApprovalPreviewModal.tsx`, `src/server/approval-case.ts` (thay `getHours()` của máy bằng múi giờ cố định) |
| **Helper dùng chung** | — | **`src/lib/datetime.ts` (mới)** — `vnLocalToUtcIso`, `formatVnDateTime`, `formatVnDate`, `parseDateOnly`, `utcIsoToVnInputValue`, `vnDateToDeadlineIso`; cố định `Asia/Ho_Chi_Minh` (UTC+7, không DST) |

**Rà soát toàn bộ nơi tạo/hiển thị thời hạn đã chuyển sang helper:**

| Nơi | File | Trước | Sau |
|---|---|---|---|
| `/my-work` tạo mới | `my-work/page.tsx:472` | `` `${d}T${t}:00Z` `` | `vnLocalToUtcIso(d, t)` |
| `/my-work` sửa | `my-work/page.tsx:563` | `new Date(x).toISOString()` | `vnLocalToUtcIso(x)` |
| `/tasks` tạo mới | `tasks/page.tsx:271` | `new Date(x).toISOString()` | `vnLocalToUtcIso(x)` |
| `/tasks/[id]` sửa / xin gia hạn | `tasks/[id]/page.tsx:452, 578` | `new Date(x).toISOString()` | `vnLocalToUtcIso(x)` |
| Bảng điều khiển giao việc | `dashboard/page.tsx:243` + mặc định (109) | `new Date(x)` | `vnLocalToUtcIso(x)` / `vnNowLocalParts` |
| Giao ban (kết luận) | `meetings/[id]/page.tsx:97` | `new Date(date)` (UTC nửa đêm ⇒ −7h) | `vnDateToDeadlineIso(date)` (17:00 VN) |
| Văn bản (form) | `docs/page.tsx:89` | `fDeadline` thô | `vnDateToDeadlineIso(fDeadline)` |
| Nạp giờ vào ô `datetime-local` | `my-work:530`, `tasks/[id]:429` | `getFullYear()/getHours()` của máy | `utcIsoToVnInputValue(iso)` |
| Hiển thị hạn | 5 file ở mục trên | `getHours()` của máy | `formatVnDateTime(iso)` |

**Phân biệt DATE-ONLY vs DATETIME:** các trường chỉ có ngày (`personal_work_items.due_date`,
`monthly_work_results.due_date/completed_date` — kiểu `@db.Date`) **không** đi qua helper thời gian,
giữ nguyên ngày đã nhập ⇒ **bảng điểm YC-33/34/35/36 không bị ảnh hưởng**.

### Vấn đề 3 — "Tự khởi tạo" nhưng UI gọi "Nhiệm vụ chỉ đạo" → **LỖI NGHIỆP VỤ (thiếu trường có cấu trúc) + UI**

| Bước | Nguyên nhân | File đã sửa |
|---|---|---|
| Ghi nhận nguồn | ❌ chỉ ghi vào `description` dạng text; `source_kind` đang mang ý nghĩa **nguồn danh mục** | `prisma/schema.prisma` (+`tasks.origin_kind`, nullable, indexed)<br>`prisma/migrations/…/migration.sql` (+`ALTER TABLE … ADD COLUMN IF NOT EXISTS`)<br>`src/lib/task-origin.ts` (**mới** — nhãn, `isSelfInitiated`)<br>`src/server/task-origin.ts` (**mới** — `resolveOriginKind()` quyết định ở server) |
| Quyết định nguồn | ❌ server không phân biệt tự tạo / được giao | `src/app/api/tasks/route.ts` (`resolveOriginKind()`; lãnh đạo giao cho người khác ⇒ `LEADER_ASSIGNED`; cán bộ tự khai "lãnh đạo giao" ⇒ hạ xuống `OUTSIDE_DIRECTIVE`) |
| Hành động | ❌ nút "Nhận việc" cho mọi task; API cho tự nhận việc của chính mình | `src/app/api/tasks/route.ts` (`ACCEPT_TASK` → **400** cho công việc tự khởi tạo)<br>`src/app/my-work/page.tsx` (ẩn nút "Nhận việc", nhãn "Nguồn: Công việc tự khởi tạo" thay "Người giao: …")<br>`src/app/tasks/[id]/page.tsx` (ẩn nút "Nhận việc") |
| Lịch sử | ❌ hard-code "Giao nhiệm vụ" | `src/app/api/tasks/[id]/route.ts` → "Khởi tạo công việc" khi công việc tự khởi tạo |
| Nguồn văn bản/giao ban | ❌ chưa ghi nguồn | `src/app/api/docs/route.ts`, `src/app/api/meetings/[id]/route.ts` → `originKind = "DOCUMENT_MEETING"` (server quyết định) |

**Giá trị `tasks.origin_kind`:** `SELF_INITIATED` · `LEADER_ASSIGNED` · `PLAN` · `DOCUMENT_MEETING` ·
`OUTSIDE_DIRECTIVE` (tự ghi nhận theo chỉ đạo ngoài hệ thống) · `NULL` (dữ liệu lịch sử chưa xác định).
`source_kind` **không bị thay thế** — vẫn mang ý nghĩa nguồn danh mục (`TX_CATALOG` / `QD1277_PRODUCT`).

---

## 2. KẾT QUẢ KIỂM THỬ

### 2.1 Bộ mới

| Bộ | Phạm vi | Kết quả |
|---|---|---|
| `scripts/test-yc38-datetime-tz.ts` | Múi giờ: chạy 4 TZ (`Asia/Ho_Chi_Minh`, `UTC`, `America/New_York`, `Asia/Tokyo`) — 17:00 VN ⇒ 10:00Z, đọc lại 17:00 VN, date-only giữ nguyên, không còn payload gắn `Z` | **19/19 ✔** |
| `scripts/test-yc38-uat-origin-tx.ts` | Nhóm 1,2,3,6,7,8,9,10: TX từ liên kết DB; không có TX ⇒ không nhãn giả; hệ số NULL ≠ 0; quá hạn/gia hạn đúng mốc; nguồn phát sinh theo vai trò; lịch sử NULL giữ hành vi cũ; **không backfill** | **23/23 ✔** |
| E2E local (`next dev` + API thật) | Tạo nhiệm vụ có TX + hạn 17:00 VN → DB nhận `10:00Z`, `origin_kind=SELF_INITIATED`, việc gốc có `catalogEntryId`; `ACCEPT_TASK` → **400**; cán bộ tự khai "lãnh đạo giao" → `OUTSIDE_DIRECTIVE`; dọn dẹp sạch | ✔ PASS |

### 2.2 Hồi quy YC-01→38 (không đổi)

| Bộ | Kết quả |
|---|---|
| `test-yc33-scoring-parity` (parity bảng điểm gốc) | **38/38 ✔** |
| `test-yc33-scoring-flow` | **20/20 ✔** |
| `test-yc34-36-eval` | **32/32 ✔** |
| `test-yc37-approval-flow` | **25/25 ✔** |
| `test-yc38c-linkage` (YC-38C) | **28/28 ✔** |
| `test-yc30-regression` (Production) | **56/56 ✔** |
| `test-yc33-36-production-smoke` (Production) | **23/23 ✔** |
| `tsc --noEmit` · `next build` | ✔ không lỗi · ✔ 91/91 trang |

### 2.3 Smoke trên Production sau deploy (`59adb01`)

- `GET /api/tasks` → `NV-2026-0016`: `txSource = { code: "NV-01", title: "Công tác thu NSNN", department: "Bộ phân Nghiệp vụ Hải quan", groupCode: "NV", convertFactor: null }` ✔
- `GET /api/tasks` → `NV-2026-0017`: `txSource.code = "NV-02"` ✔
- `GET /api/tasks/[id]` → trả `txSource` đầy đủ ✔
- `originKind` của 2 bản ghi UAT = `null` (lịch sử, **không** tự gán) ✔
- Health: `{"status":"ok","db":"up","commit":"59adb01"}` ✔

---

## 3. DỮ LIỆU TRƯỚC / SAU

| Bảng | Trước | Sau | Ghi chú |
|---|---|---|---|
| `tasks` | 20 | **20** | ✔ không đổi (0 bản ghi test sót) |
| `personal_work_items` | 28 | **28** | ✔ |
| `monthly_work_results` | 15 | **15** | ✔ 15 bản ghi DEMO giữ nguyên |
| `plan_items` | 14 | **14** | ✔ |
| `work_item_assignments` | 2 | **2** | ✔ |
| `work_catalog_entries` | 348 | **348** | ✔ |
| `product_items` | 3.386 | **3.386** | ✔ |
| `activity_templates` | 48 | **48** | ✔ |
| `tasks.origin_kind` | — | cột mới, **0 bản ghi có giá trị** | ✔ additive, lịch sử giữ NULL |
| **2 bản ghi UAT** `NV-2026-0016` / `NV-2026-0017` | có | **còn nguyên** | ✔ không xoá, không sửa |

**An toàn đã thực hiện:** backup toàn bộ 74 model / **7.471 bản ghi** (`demo-ops/`, gitignore) +
**RESTORE-TEST PASS** (0 tham chiếu mồ côi) **trước** khi đổi schema · DDL additive idempotent
(`IF NOT EXISTS`) áp local → Production, đếm trước = đếm sau · **không** DROP/TRUNCATE ·
**không** backfill `origin_kind` · **không** sửa deadline lịch sử.

---

## 4. BẢN GHI CÓ NGUY CƠ SAI HẠN NHƯNG **CHƯA SỬA** (chờ duyệt từng bản ghi)

6/20 nhiệm vụ có `original_deadline` đúng `17:00:00.000Z` (dấu hiệu nhập giờ VN qua form cũ):

| Mã | Hạn đang lưu | Nguồn | Ghi chú |
|---|---|---|---|
| `NV-2026-0011` | `2026-10-05T17:00:00.000Z` | không có TX | dữ liệu DEMO có sẵn từ 19/10 (lỗi có trước YC-38B/38C) |
| `NV-2026-0012` | `2026-12-05T17:00:00.000Z` | không có TX | như trên |
| `NV-2026-0013` | `2026-11-15T17:00:00.000Z` | không có TX | như trên |
| `NV-2026-0014` | `2026-10-20T17:00:00.000Z` | không có TX | như trên |
| **`NV-2026-0016`** | `2026-10-30T17:00:00.000Z` | `NV-01` | **bản ghi UAT — giữ nguyên** |
| **`NV-2026-0017`** | `2026-10-30T17:00:00.000Z` | `NV-02` | **bản ghi UAT — giữ nguyên** |

→ **Hiện trạng:** màn hình hiển thị `31/10/2026 00:00` cho 2 bản ghi UAT (đúng theo dữ liệu đang lưu).
**Không** tự sửa. Nếu Hải quan duyệt hiệu chỉnh, đề xuất lập danh sách 6 dòng ở trên, duyệt **từng bản ghi**,
rồi mới chạy script `UPDATE … SET original_deadline = current_deadline - interval '7 hours'` (có backup trước).

---

## 5. HƯỚNG DẪN UAT LẠI CHO `NV-2026-0016` / `NV-2026-0017`

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/my-work` → lọc tìm `UAT-YC38-01` | Cột **"NGUỒN & DANH MỤC"** hiện **`TX · NV-01`** (và `TX · NV-02`), kèm tên danh mục *Công tác thu NSNN*; dòng nguồn phát sinh: **"Chưa xác định nguồn phát sinh"** (lịch sử chưa có `origin_kind`); **không** còn `TTHQ-ĐT` |
| 2 | Mở trang chi tiết nhiệm vụ | Khối **"Nguồn công việc"**: mã TX, tên danh mục, **"Chưa có hệ số"** (NV-01/NV-02 có hệ số NULL) |
| 3 | Kiểm tra mã nhiệm vụ | Vẫn là `NV-2026-0016` — **không** bị đổi thành `NV-01`; hai mã hiển thị ở hai chỗ khác nhau |
| 4 | Xem hạn | Vẫn hiện `31/10/2026 00:00` — **đúng theo dữ liệu lịch sử chưa sửa** (không sửa lịch sử) |
| 5 | **Tạo nhiệm vụ MỚI** ở `/my-work`, nhập hạn `30/10/2026` + `17:00`, chọn TX `NV-01` | Hiển thị ngay `30/10/2026 17:00`; nếu mở từ máy đổi múi giờ vẫn `30/10/2026 17:00` |
| 6 | Nhiệm vụ mới (nguồn "Tự khởi tạo phát sinh") | Không có nút **"Nhận việc"**; nhãn nguồn: *"Công việc tự khởi tạo"*; lịch sử ghi *"Khởi tạo công việc"* |
| 7 | Lãnh đạo giao nhiệm vụ cho cán bộ khác ở `/tasks` | Vẫn hiện đủ nút **"Nhận việc"** + quyền cũ; nhãn *"Nhiệm vụ do lãnh đạo giao"*; mã TX hiện ở cột nguồn |
| 8 | Cán bộ tự chọn "Tự ghi nhận theo chỉ đạo ngoài hệ thống" | Nhãn *"Công việc tự ghi nhận theo chỉ đạo ngoài hệ thống"*; **không** sinh bằng chứng lệnh giao chính thức |

---

## 6. CẦN HẢI QUAN XÁC NHẬN

| # | Vấn đề | Trạng thái | Khuyến nghị |
|---|---|---|---|
| 1 | **Hiệu chỉnh 6 nhiệm vụ lệch 7h** (mục 4) | ⛔ Chưa sửa, chờ duyệt từng dòng | **Khuyến nghị: không sửa** — ghi nhận tại biên bản UAT là giờ nhập thực tế đã lệch; hợp đồng đánh giá dùng `due_date` date-only nên điểm không bị ảnh hưởng |
| 2 | Gán `origin_kind = SELF_INITIATED` cho 2 bản ghi UAT đã xác minh là tự khởi tạo | ⛔ Chưa UPDATE (đúng yêu cầu "không tự chỉnh sửa lịch sử") | Duyệt thì tôi cập nhật **đúng 2 dòng** này (có backup + nhật ký) |
| 3 | **Q-B4** — thứ tự ưu tiên hệ số TX vs QĐ1277 | ⛔ `PENDING_RULE` — hệ thống hiển thị cả hai, **không** tự chọn để tạo điểm chính thức | Hệ số **công việc = TX**; SP chỉ dùng khi không có TX |
| 4 | Có cho phép hiển thị **hệ số** trong bảng danh sách (dày, có thể gây nhiễu) | ⚠️ Đang hiện ở dạng rút gọn | Nếu quá nhiễu → chỉ hiện ở trang chi tiết |
| 5 | 48 mẫu cũ: ẩn khỏi form tạo mới | ⛔ Chưa ẩn (chờ rà phụ thuộc) | — |
| 6 | Mẫu 2C/2D/2E · ca trực | ⛔ Ngoài phạm vi đợt này | — |

---

## 7. KHAI BÁO

```
FIX_DEPLOYED         = YES (59adb01, db=up)
SCHEMA_CHANGE        = tasks.origin_kind (nullable, additive, 0 bản ghi backfill)
DATA_WRITES          = NONE cho dữ liệu lịch sử (2 bản ghi UAT giữ nguyên)
BACKUP_RESTORE_TEST  = PASS (74 model / 7.471 bản ghi)
REGRESSION_YC01_38   = PASS (parity 38 · flow 20 · eval 32 · approval 25 · linkage 28 · hồi quy 56 · smoke 23)
NEW_TESTS            = PASS (datetime-tz 19/19 · uat-origin-tx 23/23 · E2E local OK)
UAT_BUSINESS         = CHỜ XÁC NHẬN LẠI CỦA NGƯỜI KIỂM THỬ
```

**Tài liệu:** `docs/UAT_YC38_XAC_MINH_LOI_2026-10-21.md` (báo cáo audit trước đó) · `docs/YC38B_C_BAO_CAO_BAN_GIAO_2026-10-21.md` (bàn giao YC-38B/38C)
**Mã nguồn chính:** `src/lib/datetime.ts` · `src/lib/task-origin.ts` · `src/server/task-origin.ts` · `src/components/work/TxSourceBadge.tsx`
