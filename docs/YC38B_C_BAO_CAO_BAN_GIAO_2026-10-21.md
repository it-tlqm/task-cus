# YC-38B / YC-38C — BÁO CÁO BÀN GIAO

**Dự án:** TALUNG-CUS-WORK · **Ngày:** 21/10/2026 · **Production:** https://task-cus.vercel.app
**Commit đang chạy Production:** `d905a1d` (`db=up`) · **Nhánh:** `main`
**Trạng thái:** YC-38B ✅ đã deploy · YC-38C ✅ đã deploy (schema additive + luồng liên thông)

> **Lưu ý:** UAT nghiệp vụ **CHƯA** được xác nhận. Báo cáo này nêu rõ phần đã kiểm thử bằng máy
> và phần **còn chờ Hải quan xác nhận** (mục 6).

---

## 1. CÁC YC ĐÃ HOÀN THÀNH & ĐÃ DEPLOY

| YC | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| YC-38A | Đặc tả kiến trúc v2 (7 mục) | ✅ tài liệu | `a69311b` |
| **YC-38B** | Bộ chọn nguồn thông minh dùng chung (TX / QĐ1277) | ✅ **đã deploy** | `f16fb88` → `d905a1d` |
| **YC-38C** | Liên thông dữ liệu công việc (schema additive + write path) | ✅ **đã deploy** | `4377c8d` → `f16fb88` → `d905a1d` |
| YC-38C-C0 | Backup toàn bộ DB + restore-test | ✅ PASS | `4377c8d` |
| YC-38C-C1 | Schema additive (3 bảng mới + 20 cột mới) | ✅ áp local + Production | `4377c8d` |
| YC-38C-C6 | Bộ kiểm thử liên thông (28 assertions) | ✅ 28/28 | `f16fb88` |

**Không triển khai trong đợt này (đúng theo quyết định):** mẫu 2C/2D/2E · ca trực thành việc tính điểm ·
backfill hàng loạt 15 `monthly_work_results` DEMO · ẩn 48 mẫu khỏi form tạo mới (chờ xác minh phụ thuộc).

---

## 2. MÀN HÌNH / FORM ĐÃ THAY ĐỔI

### 2.1 Bộ chọn dùng chung — `src/components/work/WorkSourcePicker.tsx`

Áp dụng cho **`/plans`**, **`/my-work`**, **`/tasks`** (3 màn hình, 1 component):

| Hành vi | Kết quả |
|---|---|
| Nhập tên công việc trước | ✔ Không bắt buộc chọn danh mục |
| Gợi ý đầu việc TX | ✔ Tối đa **8** gợi ý, gọi server (`/api/work-catalog/suggest`), debounce 300 ms |
| Nút **"Chọn từ danh mục"** | ✔ Modal 2 tab độc lập: ① TX (348) ② Sản phẩm QĐ1277 (3.386) |
| Tìm không dấu / không phân biệt hoa thường | ✔ `unaccent()` + `ILIKE` (server-side) |
| Tìm QĐ1277 | ✔ **Server-side** `/api/products?search=&pageSize=20` — không tải 3.386 bản ghi về trình duyệt |
| Gần đây / Ghim yêu thích | ✔ `localStorage` theo người đăng nhập (tối đa 10 gần đây / 5 ghim) |
| Không hiện toàn bộ 348 mặc định | ✔ Chỉ gợi ý theo tên đã nhập |
| Tự gắn sản phẩm QĐ1277 | ✔ **KHÔNG** — chỉ gợi ý TX–QĐ1277 khi có căn cứ |
| Bắt buộc chọn 2 danh mục cùng lúc | ✔ **Đã bỏ** (TX và QĐ1277 độc lập) |
| Hệ số | ✔ Hiển thị hệ số (đọc), cho biết "Chưa có hệ số"; **không** cho sửa trong form nhập |
| 48 mẫu cũ | ✔ **Giữ nguyên lịch sử**, chưa ẩn khỏi form (chờ xác minh phụ thuộc) |

### 2.2 `/plans` — modal "Thêm đầu việc công tác"
- Thêm **bộ chọn nguồn thông minh** (mục 2.1).
- Thêm ô **"Hạng mục kế hoạch"** → liên kết **đúng** công việc với **đúng** hạng mục
  (trước đây **luôn trỏ `items[0]`** → đã sửa).
- `plan_items.work_item_id` được ghi ngược lại (liên kết 2 chiều).

### 2.3 `/my-work` — modal "Thêm việc mới (Tùy biến)"
- Thêm bộ chọn nguồn + khoá idempotency cấp form.
- Nhiệm vụ tạo ra **tự sinh công việc gốc** (`personal_work_items`) kèm provenance.

### 2.4 `/tasks` — modal giao nhiệm vụ
- Thêm bộ chọn nguồn + khoá idempotency cấp form.
- Lãnh đạo giao việc có nguồn → tự sinh công việc gốc + bảng phân công.

---

## 3. SƠ ĐỒ LUỒNG DỮ LIỆU SAU TRIỂN KHAI

```
 ┌───────────────────────── Nguồn tạo việc ─────────────────────────┐
 │  /plans (modal)      /my-work (form)      /tasks (form)          │
 │  Văn bản (docs)      Giao ban (meetings)   Kế hoạch đã duyệt      │
 └───────────────────────────────┬──────────────────────────────────┘
                                 │  sourceKind + sourceRefId (+ mã snapshot)
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │  Bộ tạo việc DUY NHẤT                            │
        │  src/server/work-item-linkage.ts                 │
        │  resolveWorkSource → resolveMonthlyPeriod →      │
        │  createLinkedWorkItem (idempotency_key)          │
        └───────────────────────┬──────────────────────────┘
                                ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ personal_work_items   (CÔNG VIỆC GỐC — 1 bản ghi / việc)      │
   │  · provenance bất biến: source_kind, source_ref_id,            │
   │                        source_code_snapshot (mã TX / mã SP)   │
   │  · đầu mối chủ trì: primary_owner_person_id  ⊕ primary_owner_  │
   │                        unit_id  (1 trong 2, không cả hai)     │
   │  · TRỤC TX : catalog_entry_id (0..1)   ← danh mục CÔNG VIỆC   │
   │  · TRỤC SP : product_item_id (0..1, legacy)                    │
   │               work_item_products (0..n)  ← danh mục SẢN PHẨM   │
   │  · chuỗi nhiều kỳ: series_id → work_item_series.series_code   │
   └───────────┬──────────────────────────────┬────────────────────┘
               │                              │
               ▼                              ▼
  work_item_assignments            tasks.work_item_id
  (1 việc gốc – N người)           plan_items.work_item_id
   role: PRIMARY_OWNER |             routine_entries.work_item_id (đã có)
          COLLABORATOR | REVIEWER
   status, progress_percent,              │
   completed_date, actual_result_text      ▼
                                          ▼
                          monthly_work_results
                           · work_item_id (định danh CÔNG VIỆC)
                           · idempotency_key = p:<person>|wi:<việc>|y|m
                           · @@unique([personId, workItemId])  (đã có, nay có tác dụng)
                           · subject_kind / subject_id / line_no
```

**Điểm then chốt đã sửa:** trước đây `tasks` **không** dẫn tới việc gốc (18/18 task mồ côi),
`plan_items` chỉ là outline, và `monthly_work_results.work_item_id = NULL` ở **15/15** bản ghi
→ ràng buộc unique vô hiệu. Nay luồng mới **luôn** ghi `work_item_id`.

---

## 4. KẾT QUẢ KIỂM THỬ & LỖI ĐÃ SỬA

### 4.1 Bộ kiểm thử

| Bộ | Phạm vi | Kết quả |
|---|---|---|
| `test-yc38c-linkage.ts` (**mới**) | T1,T2,T3,T5,T7,T10,T12,T16 + chống trùng + TX/SP độc lập | **28/28 ✔** |
| `test-yc33-scoring-parity.ts` | Parity với workbook gốc | **38/38 ✔** |
| `test-yc33-scoring-flow.ts` | YC-33 (local) | **20/20 ✔** |
| `test-yc34-36-eval.ts` | YC-34/35/36 (local) | **32/32 ✔** |
| `test-yc37-approval-flow.ts` | YC-37 (local) | **25/25 ✔** |
| `test-yc30-regression.ts` | YC-23→32 (**Production**) | **56/56 ✔** |
| `test-yc33-36-production-smoke.ts` | YC-33→36 (**Production**) | **23/23 ✔** |
| `test-yc37-approval-preview.ts` | YC-37 (Production) | ⛔ *dừng — Production chưa có hồ sơ chờ nghiệm thu (điều kiện dữ liệu, **không** phải hồi quy)* |
| Typecheck (`tsc --noEmit`) | Toàn dự án | ✔ không lỗi |
| Build (`next build`) | 91 trang | ✔ thành công |
| Smoke mới trên Production | suggest / tìm không dấu / `?ids` / products server-side | ✔ 8/8, 40 kết quả, đúng ids, 20/500, 0 khi không khớp |
| **E2E luồng ghi** (local + **Production**) | POST `/api/tasks` có TX + QĐ1277 | ✔ 201, sinh việc gốc + phân công + liên kết SP, idempotency không trùng |

### 4.2 Lỗi đã phát hiện & sửa trong quá trình triển khai

| # | Lỗi | Mức độ | Cách phát hiện | Cách sửa |
|---|---|---|---|---|
| L1 | Backup bản đầu **thiếu bảng master** (`people`, `org_units`, `activity_groups`…) → restore-test FAIL vì FK | 🔴 Cao | Restore-test lần 1 | Viết lại backup theo **DMMF** (71 model, toàn bộ bảng) → restore-test PASS |
| L2 | Kiểm tra FK dùng **tên field Prisma** (`planItemId`) thay vì **tên cột DB** (`plan_item_id`) → 13 lỗi giả | 🟡 TB | Restore-test | Ánh xạ DMMF `dbName`; FK check PASS |
| L3 | `FK_CHECKS` dùng tên camelCase trong khi model là PascalCase | 🟡 TB | Restore-test | Sửa sang PascalCase → 0 tham chiếu mồ côi |
| L4 | DDL lần đầu **chưa có** cột `idempotency_key` cho `personal_work_items` | 🟡 TB | Typecheck | Bổ sung cột + index unique (NULLS DISTINCT) |
| L5 | **`user.id` là accountId**, nhưng `tasks.created_by_id` FK trỏ `people(id)` → **tạo nhiệm vụ lỗi 500** khi có nguồn | 🔴 **Nghiêm trọng** | E2E local (`POST /api/tasks`) | Dùng `user.personId` cho `createdById`/`assignedById`/`assigned_by_id` → commit `d905a1d`, deploy lại |
| L6 | `useMemo` trong `/plans` khai báo **trước** `txEntries` → lỗi TDZ lúc render | 🟡 TB | Rà soát thứ tự khai báo | Chuyển `useMemo` xuống sau `txEntries` |

> L5 là lỗi **làm hỏng chức năng tạo nhiệm vụ** nếu đã deploy — đã phát hiện bằng kiểm thử E2E cục bộ
> **trước khi** người dùng báo lỗi, và đã sửa + deploy lại (`d905a1d`) trong phiên làm việc này.

---

## 5. DỮ LIỆU TRƯỚC / SAU & BẰNG CHỨNG BẢO TOÀN

### 5.1 Quy trình an toàn đã thực hiện

1. **Backup toàn bộ DB** → `demo-ops/yc38c-backup/yc38c-before-2026-10-21T02-44-36-730Z.json`
   (71 model · 7.391 bản ghi · 4,3 MB · thư mục `demo-ops/` **đã .gitignore** → **không** commit PII/dump).
2. **Restore-test** → nạp lại thật vào DB local scratch `talung_yc38_restore`:
   JSON hợp lệ ✔ · count khớp `counts` ✔ · đối chiếu DB nguồn không trôi dữ liệu ✔ ·
   nạp lại đủ 58 bảng có dữ liệu ✔ · **0 tham chiếu mồ côi** ✔ → **RESTORE-TEST PASS**.
3. **Áp DDL additive** bằng `scripts/apply-yc38c-ddl.ts` (idempotent, `IF NOT EXISTS`):
   - Local scratch → PASS
   - Local test → PASS
   - **Production** → PASS, **đếm trước = đếm sau** ở mọi bảng nghiệp vụ.
4. **KHÔNG** dùng `prisma migrate deploy` (Production không có bảng `_prisma_migrations`).

### 5.2 Số liệu Production (đọc trực tiếp, 21/10/2026)

| Bảng | Trước | Sau triển khai | Ghi chú |
|---|---|---|---|
| `tasks` | 18 | **18** | ✔ không đổi (bản ghi test đã dọn: 18→18) |
| `personal_work_items` | 26 | **26** | ✔ không đổi |
| `monthly_work_results` | 15 | **15** | ✔ **không xoá/gộp/sửa** (15/15 DEMO giữ nguyên) |
| `plan_items` | 14 | **14** | ✔ |
| `work_catalog_entries` | 348 | **348** | ✔ danh mục TX nguyên vẹn |
| `product_items` | 3.386 | **3.386** | ✔ danh mục QĐ1277 nguyên vẹn |
| `activity_templates` | 48 | **48** | ✔ 48 mẫu cũ giữ nguyên |
| `routine_entries` | 17 | **17** | ✔ |
| `work_item_assignments` | — | 0 | bảng mới, trống (chưa có luồng phân công tiếp từ UI) |
| `work_item_series` | — | 0 | bảng mới, trống |
| `work_item_products` | — | 0 | bảng mới, trống |

**Bằng chứng bảo toàn đặc biệt:**
- 15 bản ghi `monthly_work_results` DEMO: **không** bị backfill `work_item_id`
  (vẫn **15/15** `workItemId = NULL`) → lịch sử giữ nguyên, không tự suy đoán quan hệ.
- Không có index nào bị DROP; ràng buộc `@@unique([personId, workItemId])` **giữ nguyên** và nay
  **có tác dụng** trong luồng mới (vì `work_item_id` luôn khác NULL).
- Kiểm thử trùng: tạo 2 kết quả tháng cho cùng (người + việc + kỳ) → bản ghi thứ 2 **bị DB chặn**.

---

## 6. VẤN ĐỀ CÒN PHẢI XÁC NHẬN (chưa tự quyết)

| # | Vấn đề | Trạng thái hiện tại | Khuyến nghị |
|---|---|---|---|
| **Q-B4** | **Thứ tự ưu tiên hệ số TX vs QĐ1277** khi việc có cả hai | ⛔ **PENDING_RULE** — hệ thống hiển thị **cả hai** hệ số, **không** tự chọn để tạo điểm chính thức | Hệ số **công việc = TX**; hệ số SP chỉ dùng khi **không** có TX |
| **Q-B1** | 1 việc giao nhiều người | Đã triển khai theo khuyến nghị: 1 work item + bảng phân công | Xác nhận |
| **Q-B2** | Đầu mối chủ trì: cá nhân hay bộ phận | Đã triển khai: 1 trong 2, không cả hai, không rỗng | Xác nhận |
| **Q-B3** | 1 việc gắn nhiều sản phẩm QĐ1277 | Đã triển khai (`work_item_products` 0..n), không cộng điểm | Xác nhận |
| **Q-B5** | Mẫu 2C/2D/2E | ⛔ Chưa thuộc đợt này (theo quyết định) | — |
| **Q-B6** | Ca trực | ⛔ Giữ nguyên nghiệp vụ riêng, không thành việc tính điểm | — |
| **Q-MỚI 1** | 48 mẫu cũ: ẩn khỏi form tạo mới? | ⛔ **Chưa ẩn** — cần kiểm tra phụ thuộc trước | Chốt sau khi rà 8 bản ghi đang dùng mẫu cũ |
| **Q-MỚI 2** | 2 phiếu `evaluation_assessments` DRAFT rỗng còn lại từ smoke test trước | ⛔ Chưa dọn (cần duyệt trước khi xoá) | Xác nhận để dọn |
| **Q-MỚI 3** | `approval_cases` = 2 do bộ test YC-37 tạo trên Production | ⚠️ Cần rà/dọn | Xác nhận |
| **Q-MỚI 4** | Có cho phép người dùng **tự phân công tiếp** (UI phân công bảng `work_item_assignments`) trong đợt này? | ⛌ Chưa có UI (bảng đã sẵn sàng, write path đã có) | Chốt phạm vi |

---

## 7. CHECKLIST UAT

### 7.1 Dành cho CÁN BỘ (người nhập việc)

| # | Bước | Kết quả mong đợi | ☐ |
|---|---|---|---|
| 1 | Mở `/my-work` → **"+ Thêm việc mới (Tùy biến)"** → gõ **"báo cáo"** | Hiện **≤ 8** gợi ý đầu việc TX; **không** hiện 348 mục | ☐ |
| 2 | Gõ tiếp có dấu: "cập nhật" → gợi ý vẫn hiện (tìm **không dấu**) | ✔ | ☐ |
| 3 | Bấm **"Chọn từ danh mục"** → chuyển tab ② Sản phẩm QĐ1277 → gõ "báo cáo" | Danh sách tự tải theo từ khóa (server-side), **không** treo trình duyệt | ☐ |
| 4 | Đóng modal, mở lại → kiểm tra nhóm **"Gần đây"** và **"Ghim yêu thích"** (★) | Hiện đúng mã vừa dùng; ghim tồn tại sau khi tải lại trang | ☐ |
| 5 | Lưu việc **không** chọn danh mục | Vẫn tạo được (công việc ngoài danh mục hợp lệ) | ☐ |
| 6 | Lưu việc **có** chọn TX | Thông báo thành công; mở lại việc thấy mã TX + hệ số hiển thị | ☐ |
| 7 | Bấm "Lưu" 2 lần liên tiếp | Chỉ **1** nhiệm vụ được tạo (hệ thống chặn trùng) | ☐ |
| 8 | Mở `/plans` → "Thêm đầu việc công tác" → xem ô **"Hạng mục kế hoạch"** | Chọn đúng hạng mục; sau khi lưu, hạng mục đó **có** đầu việc (không nhảy về hạng mục đầu tiên) | ☐ |
| 9 | `/tasks` (lãnh đạo) → giao việc có chọn TX | Nhiệm vụ tạo được; việc gốc sinh kèm, không lỗi | ☐ |
| 10 | Kiểm tra trên **điện thoại** | Form không tràn, nút bấm được, modal cuộn được | ☐ |

### 7.2 Dành cho LÃNH ĐẠO

| # | Bước | Kết quả mong đợi | ☐ |
|---|---|---|---|
| 1 | Giao 1 việc cho **nhiều cán bộ** (1 chủ trì + 2 phối hợp) | **1** việc gốc duy nhất; 3 dòng phân công; **không** sinh 3 việc gốc | ☐ |
| 2 | Kiểm tra danh sách đầu việc của bộ phận | Mỗi việc có 1 đầu mối chủ trì; không có việc nào vừa có chủ trì cá nhân vừa có chủ trì bộ phận | ☐ |
| 3 | Việc có **cả** TX và sản phẩm QĐ1277 | Hiển thị **cả hai** hệ số; **không** có bảng điểm chính thức nào được tạo khi quy tắc chưa chốt (mục Q-B4) | ☐ |
| 4 | Một việc kéo dài qua **nhiều kỳ** | Giữ **một mã công việc gốc** (`series_code`), mỗi kỳ 1 dòng việc | ☐ |
| 5 | Đối chiếu bảng điểm tháng trước/sau | **Không** có dòng nào bị nhân đôi; điểm không đổi | ☐ |
| 6 | Kiểm tra 15 kết quả tháng DEMO cũ | Vẫn hiển thị đúng, không bị gộp/xoá, không tự gắn việc | ☐ |
| 7 | Xác nhận câu hỏi Q-B1..Q-B4, Q-MỚI 1..4 | Có quyết định bằng văn bản để chốt đợt tiếp theo | ☐ |
| 8 | Duyệt checklist UAT nghiệp vụ | **Chỉ khi** lãnh đạo xác nhận mới coi là hoàn tất | ☐ |

---

## 8. TÀI LIỆU & MÃ NGUỒN

| Nội dung | Đường dẫn |
|---|---|
| Đặc tả kiến trúc (đã duyệt) | `docs/YC38A_GIAI_PHAP_KIEN_TRUC_QUAN_LY_CONG_VIEC_2026-10-21.md` |
| Báo cáo này | `docs/YC38B_C_BAO_CAO_BAN_GIAO_2026-10-21.md` |
| Bộ chọn dùng chung | `src/components/work/WorkSourcePicker.tsx` |
| API gợi ý TX | `src/app/api/work-catalog/suggest/route.ts` |
| Lớp liên thông dùng chung | `src/server/work-item-linkage.ts` |
| Script áp DDL (idempotent) | `scripts/apply-yc38c-ddl.ts` |
| Backup / Restore-test | `scripts/yc38c-backup.mjs` · `scripts/yc38c-restore-test.mjs` |
| Bộ kiểm thử | `scripts/test-yc38c-linkage.ts` |
| Migration (additive) | `prisma/migrations/20261021120000_yc38c_work_item_linkage/migration.sql` |

**Kế hoạch rollback:**
1. Tắt cờ bật luồng mới (nếu đã bật) — hiện luồng mới **chỉ kích hoạt khi người dùng chọn nguồn** → tắt = không chọn danh mục.
2. Deploy lại commit `a69311b` (trước YC-38B/38C) — code cũ vẫn chạy được với schema mới (tương thích ngược).
3. Xoá bảng/cột mới **chỉ khi** chưa có dữ liệu mới: `DROP TABLE work_item_assignments|work_item_series|work_item_products` + `DROP COLUMN` các cột mới.
4. Khôi phục dữ liệu từ backup `demo-ops/yc38c-backup/` (chỉ khi đã có ghi mới cần hoàn tác).

---

**Ngày lập:** 21/10/2026 · **Người lập:** OpenCode (agent) · **Trạng thái UAT nghiệp vụ: CHỜ XÁC NHẬN CỦA LÃNH ĐẠO & HẢI QUAN**
