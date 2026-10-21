# YC-38A (v2) — ĐẶC TẢ KIẾN TRÚC QUẢN LÝ CÔNG VIỆC THỐNG NHẤT

**Dự án:** TALUNG-CUS-WORK · **Ngày:** 21/10/2026 · **Base:** `5ef8b01` (Production `5ef8b01`, `db=up`)
**Trạng thái:** `YC38A = DESIGN_ONLY` · `CODE_CHANGE = NONE` · `PRODUCTION_CHANGE = NONE` · `SCHEMA_CHANGE = NONE` · `MIGRATION_RUN = NONE`
**Đã được duyệt:** Phương án A — `personal_work_items` làm trung tâm theo dõi công việc; các nguồn tạo việc (kế hoạch, giao việc lãnh đạo, văn bản, giao ban) liên kết thống nhất.
**Bản v1 (đã commit `cd4e84e`):** audit AS-IS + so sánh phương án. Bản này bổ sung 7 mục còn thiếu.

---

## 0. Nguồn bằng chứng

| Nguồn | Cách đối chiếu |
|---|---|
| Code hiện trạng | `information_schema.columns` (Production, chỉ đọc) + đọc file/line |
| Dữ liệu Production | Aggregate chỉ đọc; mã ẩn danh `hash8`; **không** in tên/nghị |
| CV 2431/HQKV16-TCCB 25/9/2026 | PDF 15 trang, trích xuất text đầy đủ |
| Workbook gốc (`Dữ liệu.zip`) | Bảng 1 / 01A / 01B / 02A / 02B — đối chiếu công thức |
| Báo cáo GĐ3 + kiểm kê F1–F8 | `docs/YC33_37_*` |

**Số liệu Production (read-only, 21/10/2026):** `tasks` 18 · `plans` 5 · `plan_items` 14 · `plan_task_links` 4 · `personal_work_items` 26 · `monthly_work_results` 15 · `routine_entries` 17 · `result_submissions` 14 · `duty_rosters` 57 · `duty_day_infos` 5 · `task_assignees` 8 · `task_attachments` 1 · `work_evidences` 0 · `activity_templates` 48 · `product_items` 3.386 · `work_catalog_entries` 348 · `approval_cases` 0.

---

## 1. MỤC 1 — Bảng phân công, quyền cập nhật, kết quả theo từng người

### 1.1. Mô hình

Một **công việc gốc** (`personal_work_items`) có:
- **đúng 01 đầu mối chủ trì**: **cá nhân** (`primary_owner_person_id`) **hoặc** **bộ phận** (`primary_owner_unit_id`) — **không cả hai, không rỗng** (áp dụng cho bản ghi mới; bản ghi cũ giữ nguyên).
- **nhiều cán bộ phối hợp/thực hiện**: bảng `work_item_assignments` (mới), **không nhân bản công việc gốc**.

```
 personal_work_items (công việc gốc — 1 bản ghi)
   id · person_id(người phụ trách đầu mốc) · period_id
   primary_owner_person_id  ─┐  (ràng buộc 1-trong-2)
   primary_owner_unit_id     ─┘
   title · due_date · completed_date · expected_result · status
   source_kind · source_ref_id · source_code_snapshot   [provenance bất biến]
   catalog_entry_id (0..1)  → TX1 348
   plan_item_id / task_id / template_id / dept_work_item_id (legacy)
   │
   └─ work_item_assignments (0..N)        ← BẢNG MỚI
        work_item_id · person_id · period_id
        role: PRIMARY_OWNER | COLLABORATOR | REVIEWER
        status: ASSIGNED | ACCEPTED | IN_PROGRESS | DONE | REJECTED
        progress_percent · completed_date · actual_result_text · note
        assigned_by_id (người giao) · assigned_at · responded_at
        UNIQUE(work_item_id, person_id, period_id)
```

**Quy tắc chủ trì:**
1. `primary_owner_person_id` và `primary_owner_unit_id` **loại trừ lẫn nhau** (check ở tầng ứng dụng, DB không có FK chéo).
2. Nếu chủ trì là **bộ phận**: `primary_owner_unit_id` = đơn vị; các thành viên được phân công nằm trong `work_item_assignments`; **không** bắt buộc có `primary_owner_person_id`.
3. Khi phân công xuống dưới, hệ thống **ghi thêm 1 dòng assignment** (người được giao) chứ **không** tạo work_item mới → giữ "một việc gốc".
4. `work_item_assignments` có **tối đa 1** dòng `role = PRIMARY_OWNER` cho mỗi `(work_item_id, period_id)`.
5. Lãnh đạo giao thẳng cho cán bộ → `primary_owner_person_id` = người nhận; `tasks.ownerId` = người tạo/giao (tách khỏi chủ trì).

### 1.2. Ma trận quyền cập nhật

| Hành động | Chủ trì (cá nhân) | Chủ trì (bộ phận) | Cán bộ phối hợp | Người tạo | Lãnh đạo trong phạm vi | Quản trị hệ thống |
|---|---|---|---|---|---|---|
| Sửa tiêu đề / kết quả cần đạt / hạn | ✔ phần của mình | ✔ | ✖ | ✖ | ✔ | ✖ |
| Cập nhật tiến độ / kết quả thực hiện | ✔ dòng của mình | ✔ các dòng được giao | ✔ **chỉ dòng của mình** | ✖ | ✔ | ✖ |
| Ghi minh chứng | ✔ dòng của mình | ✔ | ✔ dòng của mình | ✖ | ✔ | ✖ |
| Đổi đầu mối chủ trì | ✖ (cần lãnh đạo) | ✖ | ✖ | ✖ | ✔ | ✖ |
| Thêm cán bộ phối hợp | ✔ | ✔ | ✖ | ✖ | ✔ | ✖ |
| Ghi kết quả tháng | ✔ dòng của mình | ✔ | ✔ dòng của mình | ✖ | ✔ | ✖ |
| Quyết định xếp loại cuối cùng | ✖ | ✖ | ✖ | ✖ | ✔ (`final_grade`) | ✖ |

**Quy tắc cốt lõi:** mọi cập nhật tiến độ/kết quả đi qua `work_item_assignments` (theo dòng của người), **không** ghi đè lẫn nhau; lịch sử ghi vào `task_updates`/`audit_events` như hiện tại.

### 1.3. Kết quả theo từng người / từng kỳ — không nhân bản

- Mỗi người được phân công có **1 dòng `work_item_assignments`** mỗi kỳ → **kết quả của riêng người đó** mà **vẫn là 1 công việc gốc**.
- `monthly_work_results` giữ `work_item_id` + `person_id` → **1 kết quả / (người × kỳ × công việc)**; khóa `@@unique([personId, workItemId])` **có tác dụng** khi `work_item_id` luôn khác NULL (luồng mới).
- Khi 1 việc có 3 người thực hiện trong 1 kỳ → **3 kết quả tháng**, **1** công việc gốc, **3** dòng assignment. Bảng 01A/01B lấy điểm theo **từng người**; điểm lãnh đạo = bình quân theo quan hệ phụ trách (YC-35), **không** cộng dồn.

---

## 2. MỤC 2 — Danh mục TX và sản phẩm QĐ1277 là hai khái niệm độc lập

### 2.1. Nguyên tắc

| | Danh mục TX (`work_catalog_entries`) | Sản phẩm QĐ1277 (`product_items`) |
|---|---|---|
| Vai trò | **NGUỒN công việc** (việc làm gì) | **SẢN PHẨM ĐẦU RA** (kết quả tạo ra) |
| Số lượng | 348 | 3.386 |
| Trường hệ số | `convert_factor` | `convert_factor` |
| Nhóm | 6 nhóm TX (không phải bộ phận) | nhóm QĐ1277 (khác hệt) |

**Quy tắc bất di bất dịch:**
1. **KHÔNG** gộp thành một trường `source_ref_id` duy nhất → giữ **2 trục riêng biệt**.
2. **KHÔNG** tự đồng nhất hệ số: `work_catalog_entries.convert_factor` ≠ `product_items.convert_factor`; **không** ghi đè, **không** cộng, **không** suy ra hệ số này từ hệ số kia.
3. Một công việc: **0..1 đầu việc TX** + **0..n sản phẩm QĐ1277**.

### 2.2. Thay đổi cấu trúc (additive)

```
 personal_work_items.catalog_entry_id   (0..1)  ← GIỮ NGUYÊN, đã có sẵn, đang là trục TX
 personal_work_items.product_item_id    (0..1)  ← GIỮ NGUYÊN (tương thích ngược)
 │
 └─ work_item_products (BẢNG MỚI)               ← cho phép 0..n sản phẩm QĐ1277
      work_item_id · product_item_id · quantity · is_primary · note
      UNIQUE(work_item_id, product_item_id)
```

- Luồng mới ghi vào `work_item_products`; `product_item_id` (cũ) được **ghi đồng thời** khi có đúng 1 sản phẩm → tương thích ngược, **không** xoá cột.
- Đọc: `productItemIds = work_item_products ∪ (product_item_id cũ nếu có)` → không mất dữ liệu lịch sử.
- `catalog_entry_id` **không** nằm trong `work_item_products` → hai khái niệm **không** bị trộn.

### 2.3. Quy tắc nguồn hệ số (đang chờ Hải quan chốt — Q-B4)

| Tình huống | Hệ số dùng để tính điểm | Trạng thái |
|---|---|---|
| Có TX + có SP | **chưa chốt** (TX ưu tiên? SP ưu tiên? cả hai?) | ⛔ `PENDING_RULE` — hiện YC-33 chọn theo nguồn được khai báo, **không** tự quyết |
| Chỉ có TX | `work_catalog_entries.convert_factor` | ✔ đã chạy |
| Chỉ có SP | `product_items.convert_factor` | ✔ đã chạy (14/15 bản ghi hiện dùng đường này) |
| TX có hệ số = 0 | dùng 0 (không phải "thiếu") | ✔ đã chạy |
| TX có hệ số NULL | `INSUFFICIENT_DATA` — không ra điểm giả | ✔ đã chạy |

**Đề xuất (cần duyệt):** hệ số **công việc** = TX; hệ số **sản phẩm** chỉ dùng khi công việc **không** gắn TX. Trong khi chờ, hệ thống hiển thị cả hai và **không** tự chọn.

---

## 3. MỤC 3 — Công việc kéo dài nhiều kỳ: 1 mã gốc, kết quả theo người/kỳ, chống tính trùng

### 3.1. Chuỗi công việc (work series)

```
 work_item_series (BẢNG MỚI) — 1 việc gốc xuyên nhiều kỳ
   id · series_code (mã gốc ổn định, ví dụ "CV-2026-000123") · title
   owner_type: PERSON | UNIT     (đầu mối chủ trì cấp gốc)
   owner_id
   created_at · created_by_id
 │
 └─ personal_work_items (1 DÒNG MỖI KỲ)
      series_id (FK, nullable — bản ghi cũ không có → NULL)
      period_id (kỳ đánh giá)         ← đã có
      line_no (thứ tự lượt trong kỳ)   ← MỚI
```

- **Một mã gốc**: `series_code` giữ nguyên suốt vòng đời; **mỗi kỳ = 1 dòng `personal_work_items`** (vì kết quả và điểm là theo kỳ).
- Bản ghi cũ (26 dòng) chưa có `series_id` → giữ `NULL`, **không** backfill hàng loạt (tránh tạo quan hệ giả); có thể gắn thủ công khi lãnh đạo xác nhận.
- `series_id` NULL ⇒ mỗi work_item là việc độc lập (hành vi **hiện tại**, không đổi).

### 3.2. Chống tính điểm trùng — 3 tầng

| Tầng | Cơ chế | Áp dụng |
|---|---|---|
| **1. Ràng buộc DB** | `@@unique([personId, workItemId])` — **partial**: chỉ ràng buộc khi `workItemId IS NOT NULL` | Luồng mới (work_item luôn khác NULL) |
| **2. Khóa idempotency ứng dụng** | `idempotency_key = person:<id>|wi:<workItemId>|p:<period>` — unique partial, dùng khi tạo qua API | Luồng mới; chống double-click/retry |
| **3. Snapshot tính điểm** | `score_runs` unique `(personId, periodType, periodYear, periodNumber, formulaVersion)` (đã có) + `score_run_items.monthly_result_id` | Luồng đã có; **không** tính lại kết quả đã chốt |

**Không** đặt unique cứng `(task_id, period_id)` (cảnh báo §4 tài liệu đề bài): một task có thể có nhiều lượt, nhiều người, nhiều đầu việc con.

**Hiện trạng (đã kiểm chứng):** `@@unique([personId, workItemId])` **đang vô hiệu** vì `workItemId = NULL` ở **15/15** bản ghi. Chặng C1 sẽ chuyển thành partial unique → **có tác dụng ngay, không đụng 1 bản ghi cũ nào**.

---

## 4. MỤC 4 — Phân tích 3 nhóm nghi vấn trùng `monthly_work_results` (chỉ đọc)

### 4.1. Kết quả kiểm tra (Production, chỉ đọc)

| Nhóm (người + sản phẩm + kỳ) | Số bản ghi | Tiêu đề | Số lượng (giao/hoàn thành) | Hạn / hoàn thành | Kết luận |
|---|---|---|---|---|---|
| N1 | 4 | "[DEMO] Kiểm tra hồ sơ tờ khai nhập khẩu - hoàn thành đủ dữ liệu" · "[DEMO] Chỉ tiêu chưa nhập số liệu (missing)" · "[DEMO] Chỉ tiêu có giá trị 0 (zero)" · "[DEMO] Chỉ tiêu chưa nhập số liệu (missing thêm, =0)" | 10/10 · 5/0 · 5/0 · 5/**null** | 20-10→19-10 · 31-10→— · 31-10→28-10 · 31-10→— | **4 công việc KHÁC NHAU** (cùng 1 sản phẩm QĐ1277, cùng 1 tháng) |
| N2 | 2 | "[DEMO] Giảm số kho ngoại quan - hoàn thành" · "[DEMO] Sản phẩm hệ số 1.92 - kiểm thử quy đổi" | 3/3 · 2/2 | 28-10→27-10 · 31-10→30-10 | **2 công việc khác nhau** |
| N3 | 2 | "[DEMO] Tổng hợp báo cáo giám sát tuần - một phần" · "[DEMO] Sản phẩm hệ số 10.6 - kiểm thử quy đổi" | 3/2 · 2/2 | 30-10→— · 31-10→30-10 | **2 công việc khác nhau** |

**Phát hiện quyết định:**
- **3/3 nhóm thuộc người DEMO**; **15/15** `monthly_work_results` trên Production là dữ liệu DEMO.
- Tiêu đề ghi rõ **mục đích kiểm thử**: *missing* (thiếu số liệu) · *zero* (giá trị 0) · *kiểm thử quy đổi* (kiểm tra hệ số). Đây là **fixture kiểm thử YC-33 có chủ đích**, **KHÔNG phải trùng**.
- **KHÔNG có bất kỳ bản ghi nào cần xoá, gộp hoặc sửa.**

### 4.2. Nguyên nhân của "nghi vấn trùng"

Khoá heuristic đã dùng là **(người + `product_item_id` + kỳ)** — **thiếu chiều "đối tượng công việc"**:
- Một **sản phẩm QĐ1277** có thể là đầu ra của **nhiều công việc khác nhau** trong cùng tháng (đúng nghiệp vụ).
- Vì `work_item_id = NULL` ở 15/15 bản ghi, hệ thống **chưa có** định danh công việc ở tầng kết quả tháng → tầng lưu trữ chỉ biết "người + sản phẩm + kỳ" ⇒ gộp nhầm.

⇒ **Đây là bằng chứng thiết kế cho Mục 3**: định danh kết quả tháng phải theo **công việc** (`work_item_id`), không theo sản phẩm.

### 4.3. Phương án xử lý (không đụng dữ liệu)

| # | Hành động | Phạm vi | Rủi ro |
|---|---|---|---|
| P1 | `@@unique([personId, workItemId])` → **partial unique** (`WHERE work_item_id IS NOT NULL`) | Schema | Không — 15 bản ghi cũ `workItemId = NULL` không bị ảnh hưởng; 0 bản ghi bị sửa |
| P2 | Thêm `idempotency_key` (partial unique) cho luồng tạo mới | Schema + API | Không — chỉ dùng cho bản ghi mới |
| P3 | **KHÔNG** backfill `work_item_id` cho 15 bản ghi DEMO | — | Giữ nguyên lịch sử; dữ liệu thật (nếu có) sẽ tự sinh work_item khi nhập qua API mới |
| P4 | Bổ sung `line_no` trên `personal_work_items` để phân biệt nhiều lượt cùng kỳ | Schema | Không |
| P5 | Nếu Hải quan muốn dữ liệu thật trong `monthly_work_results` → tạo `work_item` tương ứng rồi mới gắn `work_item_id` | Thủ công, có duyệt | Trung bình — **cần người quyết định từng bản ghi** |
| P6 | Tách/lọc dữ liệu DEMO ở Production (cờ hiển thị, **không xoá**) | C1/C4 | Thấp |

**Cam kết:** YC-38A **không** xoá/gộp/sửa bất kỳ bản ghi `monthly_work_results` nào.

---

## 5. MỤC 5 — Luồng tạo việc & giữ provenance từ danh mục TX

### 5.1. Luồng hiện trạng (đã kiểm chứng bằng code)

| Màn hình | API | Bảng ghi tạo | Nguồn TX giữ được? | work_item tạo? |
|---|---|---|---|---|
| `/plans` — tạo kế hoạch | `POST /api/plans` (`plans/route.ts:160`) | `plans` + `plan_items` | ❌ `plan_items` chỉ lưu `title/groupId/sortOrder` (`route.ts:167-173`) → **mất nguồn** | ❌ |
| `/plans` — "Thêm đầu việc công tác" | `POST /api/personal-work-items` (`personal-work-items/route.ts:398`) | `personal_work_items` | ✅ `catalogEntryId` (TX) **hoặc** `productItemId` (SP) **hoặc** `templateId`/`deptWorkItemId` | ✅ **đây là bản ghi việc thật**; `planItemId` trỏ `items[0]` |
| `/my-work` — "Thêm việc mới (Tùy biến)" | `POST /api/tasks` (`tasks/route.ts:272`) | `tasks` + `task_assignees` | ❌ chỉ `title`/`description` tự do | ❌ → **không tính được điểm** |
| `/tasks` — lãnh đạo giao | `POST /api/tasks` (cùng route) | `tasks` | ❌ | ❌ |
| Văn bản đến | `POST /api/docs` (`docs/route.ts:176`) | `tasks` | ❌ (chỉ `ownerId`/`deadline` từ văn bản) | ❌ |
| Biên bản giao ban | `POST /api/meetings/[id]` (`meetings/[id]/route.ts:162`) | `tasks` | ❌ (chỉ `ownerId`/`deadline` từ kết luận) | ❌ |
| `/routine` — nhật ký tác nghiệp | `POST /api/routine` (`routine/route.ts:399,418,441`) | `routine_entries` (+ `personal_work_items` **nếu** caller không truyền `workItemId`) + `result_submissions` | ⚪ `templateId` (48 mẫu) | ⚠️ tái dùng 17/17 bản ghi thật |

### 5.2. Luồng TO-BE (giữ provenance TX xuyên suốt)

```
 [Giao diện: nhập tên → gợi ý TX → chọn TX (tuỳ chọn)]
        │  sourceKind + sourceRefId (+ mã snapshot)
        ▼
 ┌──────────────────────┐
 │  Bộ tạo việc duy nhất│  ← 1 entry point cho MỌI nguồn
 └──────────┬───────────┘
            │  1) tạo/gắn work_item (có provenance)
            │  2) tạo task (lớp phân công) → tasks.work_item_id
            ▼
   personal_work_items  ── work_item_assignments (chủ trì + phối hợp)
            │
            ├── plan_items.work_item_id  (thay vì trỏ items[0])
            ├── routine_entries.work_item_id (đã có)
            └── monthly_work_results.work_item_id (+ idempotency_key)
```

**Quy tắc bắt buộc (chặng C6):**
1. Mọi lệnh tạo việc (`/my-work`, `/tasks`, `/plans`, văn bản, giao ban) **phải** đi qua bộ tạo việc chung → luôn ghi `source_kind` + `source_ref_id` + `source_code_snapshot`.
2. Khi có **đủ căn cứ** (người được giao + kỳ + nguồn) → **tự sinh `personal_work_items`** và `tasks.work_item_id` trỏ tới → việc được giao **có** đường dẫn tới đánh giá.
3. `plan_items` mang `work_item_id` → hạng mục kế hoạch trỏ **đúng** việc, thay vì `items[0]`.
4. Khi tạo từ văn bản/giao ban: `source_kind = DOCUMENT | MEETING`, `source_ref_id` = id văn bản/kết luận → **truy vết được** về nguồn (hiện chỉ còn `task.description`).
5. **Provenance bất biến**: `source_code_snapshot` (mã TX / mã SP) được ghi lúc tạo; đổi danh mục sau này **không** sửa lịch sử.
6. Với TX, `catalog_entry_id` **và** mã TX đều lưu → kể cả khi phiên bản danh mục được thay thế, vẫn tra được việc gốc.

---

## 6. MỤC 6 — Hướng UI (giữ nguyên phương hướng đã chốt)

**Nguyên tắc:** cán bộ **nhập tên việc trước** → hệ thống **gợi ý mã TX** → có **nút chọn từ danh mục**; tìm **không dấu**; có **gần đây / yêu thích**; **sản phẩm QĐ1277 chọn riêng** khi cần; **48 mẫu cũ chỉ bảo toàn lịch sử**, ẩn khỏi form mới **sau khi xác minh phụ thuộc**.

### 6.1. Component dùng chung (1 cho `/my-work`, `/plans`, `/tasks`)

```
<WorkSourcePicker
  value={{ sourceKind, sourceRefId, sourceCodeSnapshot, title }}
  onChange={...}
  suggestions={...}          // từ server, ≤8 gợi ý TX
  recentSourceIds={...}     // theo người đang đăng nhập (client)
  favoriteSourceIds={...}   // client, tối đa 5
/>
```

### 6.2. Hành vi chi tiết

| Hành vi | Yêu cầu |
|---|---|
| Ô nhập chính | Tiêu đề tự do, **không** bắt buộc chọn danh mục |
| Gợi ý TX | Sau ≥ 3 ký tự → `GET /api/work-catalog/suggest?q=` (server): ưu tiên (1) khớp tiêu đề không dấu, (2) nhóm TX người đó hay dùng, (3) cùng đơn vị, (4) nhóm `TH` khi từ khóa báo cáo/tổng hợp. Tối đa 8, **không** khóa lựa chọn |
| Nút *Chọn từ danh mục* | 2 tab **độc lập**: ① Danh mục TX (348) ② Sản phẩm QĐ1277 (3.386) — **không** bắt buộc chọn cả hai |
| Tìm TX | `GET /api/work-catalog?q=` — không dấu, theo mã (`NV-01`) hoặc tiêu đề |
| Tìm QĐ1277 | **server-side** `GET /api/products?search=&pageSize=20` — **không** tải 3.386 bản ghi về client |
| Gần đây / Yêu thích | theo người đang đăng nhập; lưu client-side; **không** hiển thị dữ liệu người khác |
| Hệ số | Nếu mã TX có hệ số → hiển thị *Hệ số: 2.5* (đọc) hoặc *Chưa có hệ số*; **không** cho sửa trong form nhập |
| 48 mẫu legacy | Ẩn khỏi form **mới**; bản ghi cũ vẫn hiện nguồn "Mẫu cũ", **không** sửa/xoá |
| Danh mục bộ phận | Giữ nguyên như một nguồn thay thế (độc lập với TX) |
| 6 nhóm TX | **Không** hiển thị như "bộ phận"; giữ nhãn nhóm gốc |
| 5 nhóm legacy | **Không** ép tương ứng 6 nhóm TX; nếu biểu báo cáo cần → lớp mapping riêng, **kiểm duyệt** |

---

## 7. MỤC 7 — Kế hoạch chuyển đổi an toàn, hồi quy, rollback

### 7.1. Các chặng (mở rộng từ v1, bổ sung kiểm thử & rollback)

| Chặng | Nội dung | Kiểm tra bắt buộc | Điểm dừng | Rollback |
|---|---|---|---|---|
| **C0** | Backup JSON Production (bảng liên quan) + **restore-test** trên clone local | đọc lại được, đủ số bản ghi | có file backup đọc được | — |
| **C1** | **Schema additive**: `work_item_assignments` · `work_item_series` · `work_item_products` · `personal_work_items.{primary_owner_person_id, primary_owner_unit_id, source_kind, source_ref_id, source_code_snapshot, series_id, line_no}` · `tasks.{work_item_id, created_by_id, assigned_by_id}` · `plan_items.work_item_id` · partial unique `monthly_work_results` | `checks_failed=0`; **đếm đối chiếu trước/sau bằng nhau**; 0 bản ghi bị UPDATE/DELETE | đếm lệch → dừng | `DROP` cột/bảng mới (chưa có dữ liệu) |
| **C2** | **Dry-run backfill** trên local fixture (`scripts/yc38c-dryrun-backfill.mjs`) | checksum ổn định chạy 2 lần; đếm bảo toàn | có dòng `UNRESOLVED`/`MƠ HỒ` → **dừng, hỏi người duyệt** | không áp dụng |
| **C3** | **Backfill an toàn** (chỉ cột NULL; **không** tạo quan hệ giả) | số `UNRESOLVED` đã được duyệt từng dòng | còn dòng chưa duyệt → dừng | revert theo backup C0 |
| **C4** | **Read adapter** `GET /api/work-items?scope=` (chỉ đọc) + feature flag theo đơn vị | output cũ **không đổi** khi tắt cờ | lệch output → tắt cờ | tắt cờ |
| **C5** | **Dual-write có kiểm soát**: tạo work_item → ghi `tasks.work_item_id`; `idempotency_key`; bật theo đơn vị | đối chiếu số bản ghi 2 bảng khớp | lệch số → tắt cờ | tắt cờ |
| **C6** | **Write-path thống nhất**: `POST /api/tasks` + `POST /api/plans` nhận `sourceKind`/`sourceRefId`; tự sinh work_item khi đủ căn cứ; `plan_items.work_item_id` đúng hạng mục | 0 task mới không có đường tới đánh giá | còn task "mồ côi" → cho phép đánh dấu `UNLINKED` | tắt cờ + adapter |
| **C7** | **Ẩn 48 mẫu khỏi form mới** (giữ nguyên lịch sử) | đã đánh giá phụ thuộc; số work_item dùng mẫu cũ không đổi | còn mẫu cũ trong form → hoàn tác | hiện lại |
| **C8** | **Thu hồ adapter** khi YC-38C nghiệm thu | hồi quy YC-01→37 xanh | lỗi → giữ adapter | giữ adapter lâu dài |

### 7.2. Quy tắc match backfill (đề xuất — chờ duyệt)

- `source_kind` (thứ tự ưu tiên): `catalog_entry_id`→TX_CATALOG · `product_item_id`→QD1277_PRODUCT · `plan_item_id`→PLAN · `dept_work_item_id`→DEPT · `template_id`→LEGACY_TEMPLATE · còn lại→CUSTOM.
- `primary_owner_person_id` fallback = `person_id` của chính work_item (**không** tự lấy `task.ownerId` khi lệch người).
- `primary_owner_unit_id` = **NULL** ở backfill (chưa có căn cứ) → chỉ lãnh đạo gán.
- `tasks.work_item_id`: **không** backfill tự động (0 ứng viên khớp) → đánh dấu `UNLINKED`.
- `series_id`: **không** backfill (26 bản ghi không có căn cứ gộp kỳ) → NULL = việc độc lập, như hiện tại.

### 7.3. Kiểm thử hồi quy (bắt buộc mỗi chặng)

| Bộ | Phạm vi | Ngưỡng |
|---|---|---|
| `test-yc30-navigation.ts` | cấu trúc menu | 197/197 |
| `test-yc30-ui.ts` | desktop + mobile | 55/55 |
| `test-yc30-regression.ts` | YC-23→32 (Production) | 56/56 |
| `test-yc37-approval-flow.ts` | YC-37 (local) | 25/25 |
| `test-yc37-approval-preview.ts` | YC-37 (Production, chỉ đọc) | 18/18 |
| `test-yc33-scoring-parity.ts` | parity workbook gốc | 38/38 |
| `test-yc33-scoring-flow.ts` | YC-33 (local) | 20/20 |
| `test-yc34-36-eval.ts` | YC-34/35/36 (local) | 32/32 |
| `test-yc33-36-production-smoke.ts` | YC-33→36 (Production, chỉ đọc) | 23/23 |
| **Mới — `test-yc38c-*.ts`** | 20 tình huống §6.1 (bảng ma trận) | 20/20 |

### 7.4. Ma trận kiểm thử YC-38C (20 tình huống)

| # | Tình huống | Kỳ vọng | Cấp |
|---|---|---|---|
| T1 | 1 việc giao 1 người | 1 work_item, 1 chủ trì, đúng nguồn | Unit+API |
| T2 | 1 việc giao **bộ phận** | `primary_owner_unit_id` set, `primary_owner_person_id` NULL | Unit |
| T3 | 1 việc giao nhiều người | ≥2 assignment, **1** `PRIMARY_OWNER`, **không** nhân bản work_item | Unit+UI |
| T4 | Giao qua trưởng BP → phân công tiếp | giữ truy vết việc gốc, không tạo việc gốc mới | Unit |
| T5 | 1 kế hoạch nhiều kỳ | mỗi kỳ 1 work_item cùng `series_code` | Unit |
| T6 | Ca trực không có sản phẩm | **không** sinh work_item/sản phẩm | Unit |
| T7 | 1 task có nhiều work_item khác kỳ | hợp lệ, **không** coi là trùng | Unit+DB |
| T8 | TX hệ số = 0 | giữ 0, điểm 0, không phải "thiếu" | Unit |
| T9 | TX hệ số NULL | `INSUFFICIENT_DATA`, không ra điểm giả | Unit |
| T10 | 1 việc có nhiều sản phẩm QĐ1277 | `work_item_products` nhiều dòng, hệ số **không** cộng | API+DB |
| T11 | Phê duyệt trước/sau | audit + `approval_cases` đúng vòng | API+UI |
| T12 | Double-click / retry | 1 bản ghi (`idempotency_key`) | API |
| T13 | Đổi người chủ trì | audit + lịch sử giữ | API+DB |
| T14 | Không đủ quyền | 403, **không** ghi | API |
| T15 | Đánh giá quý | không tự tổng hợp tháng → quý | Unit |
| T16 | Lịch sử 48 mẫu | hiện đúng, không sửa, không xoá | UI+DB |
| T17 | Tìm QĐ1277 > 3.000 | server-side, < 1s | API+UI |
| T18 | Gợi ý TX khi nhập tên | ≤ 8 gợi ý, ưu tiên đúng | UI |
| T19 | Dữ liệu DEMO Production | lọc/tách an toàn, **không xoá** | DB |
| T20 | Hồi quy YC-01→37 | không hỏng | E2E |

### 7.5. Tiêu chí nghiệm thu

- 0 bản ghi bị mất; đếm trước/sau bằng nhau ở mọi bảng.
- Mọi work_item mới có `source_kind` + `source_ref_id` **hoặc** `CUSTOM` hợp lệ.
- 100% việc được giao (mới) có đường dẫn tới đơn vị đánh giá.
- 0 việc có 2 chủ trì; 0 việc có cả chủ trì cá nhân lẫn bộ phận.
- 0 kết quả tháng trùng (người + công việc + kỳ); partial unique có tác dụng.
- 348 TX + 3.386 sản phẩm + 48 mẫu còn nguyên; 6 nhóm TX không bị ép vào bộ phận.
- 0 lỗi console; hồi quy YC-01→37 xanh.

### 7.6. Rollback tổng thể

| Mức | Cách | Thời gian |
|---|---|---|
| Tắt cờ | feature flag theo đơn vị → hệ thống về hành vi cũ | tức thì |
| Revert code | deploy lại commit trước C1 | ~5 phút |
| Revert schema | `DROP` bảng/cột mới (chỉ khi **chưa** có dữ liệu mới) | ~1 phút |
| Khôi phục dữ liệu | khôi phục backup C0 (chỉ khi backfill C3 đã chạy) | theo quy mô DB |

**Điểm dừng bắt buộc trước Production:** duyệt Phương án A (đã có) · trả lời Q-B1…Q-B4 · backup C0 + restore-test · báo cáo dry-run C2 được rà soát.

---

## 8. CÂU HỎI CẦN DUYỆT (tổng hợp)

### 8.1. Chặn triển khai (cần Hải quan)

| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| **Q-B1** | 1 việc giao nhiều người → 1 work_item + bảng phân công, hay 1 work_item/người? | **1 work_item + `work_item_assignments`** (khớp "một việc gốc") |
| **Q-B2** | Đầu mối chủ trì là cá nhân hay bộ phận? Có cả hai không? | **1 trong 2, không cả hai**; giao xuống bộ phận → sinh chủ trì cá nhân khi phân công tiếp |
| **Q-B3** | 1 việc được gắn **nhiều** sản phẩm QĐ1277 không? | **Có** (0..n) — đề xuất bảng `work_item_products` |
| **Q-B4** | Khi việc có cả TX và SP → hệ số nào dùng để tính điểm? | **Hệ số công việc = TX**; hệ số SP chỉ dùng khi **không** có TX. Trong lúc chờ: hiển thị cả hai, **không** tự chọn |
| **Q-B5** | Mẫu 2C (báo cáo kết quả thực hiện nhiệm vụ **của đơn vị**, theo quý) là đầu ra bắt buộc? | **Có** (CV2431 mục IV.1.1.a/c liệt kê 2C trong bộ hồ sơ quý) |
| **Q-B6** | Ca trực có phải đầu vào của kết quả đánh giá quý không? | **Chưa** (giữ nguyên như hiện tại) |

### 8.2. Quyết định kỹ thuật (Agent đề xuất, không cần hỏi Hải quan)

T-K1 bảng gốc = `personal_work_items` · T-K2 tên bảng `work_item_assignments` / `work_item_series` / `work_item_products` · T-K3 partial unique + `idempotency_key` · T-K4 provenance `source_kind`+`source_ref_id`+`source_code_snapshot` · T-K5 feature flag theo đơn vị · T-K6 backfill chỉ cột null, không tạo quan hệ giả · T-K7 giữ 48 mẫu, ẩn khỏi form mới · T-K8 không tạo mapping 6 nhóm TX ↔ bộ phận · T-K9 lọc dữ liệu DEMO bằng cờ, không xoá · T-K10 partial unique thay vì unique cứng.

### 8.3. Cần duyệt riêng (kỹ thuật + thủ tục)

| # | Việc | Ghi chú |
|---|---|---|
| A1 | Cho phép **6 bảng/cột mới** (C1) | additive, 0 xoá dữ liệu |
| A2 | Cho phép `POST /api/tasks` + `POST /api/plans` **bắt buộc nhận nguồn** (C6) | thay đổi hành vi form → cần thông báo cán bộ |
| A3 | Cho phép **ẩn 48 mẫu** khỏi form mới (C7) | giữ nguyên lịch sử |
| A4 | Cho phép bộ chọn thông minh **dùng chung** cho 3 màn hình (§6) | YC-38B |
| A5 | Cho phép **push** commit tài liệu YC-38A lên `main` | đã kiểm tra diff: chỉ tài liệu + script chỉ đọc, không PII/secret |

---

## 9. KHẲNG ĐỊNH

```
YC38A             = DESIGN_ONLY (v2 — đặc tả kiến trúc cuối cùng)
CODE_CHANGE       = NONE
SCHEMA_CHANGE     = NONE
MIGRATION_RUN     = NONE
BACKFILL_RUN      = NONE
PRODUCTION_CHANGE = NONE
DATA_WRITES       = NONE   (mọi truy vấn Production trong tài liệu này là chỉ đọc)
```

**Tài liệu:** `docs/YC38A_GIAI_PHAP_KIEN_TRUC_QUAN_LY_CONG_VIEC_2026-10-21.md` (bản này) · `docs/YC38A_OPENCODE_DESIGN_ONLY/YC38A/YC38A_KIEN_TRUC_QUAN_LY_CONG_VIEC.md` (đặc tả yêu cầu) · `docs/YC33_37_GIAI_DOAN_3_BAO_CAO_2026-10-21.md` · `docs/YC33_37_KIEM_KE_FORM_TAO_CONG_VIEC_2026-10-21.md`.
**Công cụ:** `scripts/yc38c-dryrun-backfill.mjs` (dry-run chỉ đọc, từ chối chạy ngoài localhost).
