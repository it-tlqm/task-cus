# YC-38 B4 — BÁO CÁO BÀN GIAO SỬA LỖI TRÌNH DUYỆT KẾT QUẢ

**Dự án:** TALUNG-CUS-WORK · **Ngày:** 21/10/2026
**Commit triển khai:** `96be5e4` · **Production:** `{"status":"ok","db":"up","commit":"96be5e4"}`
**Trạng thái:** đã sửa, đã test, đã deploy — **dừng ở trạng thái chờ UAT**
**Không** thao tác nộp duyệt / phê duyệt trên `NV-2026-0019` · **không** đổi schema · **không** ghi dữ liệu lịch sử

---

## 1. ROOT CAUSE & FILE ĐÃ SỬA

### 1.1 Root cause (đã xác nhận ở báo cáo audit)

| Bước | Vấn đề | Xử lý |
|---|---|---|
| Form `/tasks/[id]` | gửi `submitForReview` (đúng ý định) | giữ, chuẩn hóa tên field |
| API `/api/tasks/[id]/updates` | **không đọc** `submitForReview` ⇒ `statusAfter` giữ `IN_PROGRESS`, `kind='progress'` | **sửa** |
| `/my-work` | gửi `newStatus`/`statusAfter` (đúng tên API đọc) ⇒ hoạt động đúng | **giữ nguyên** |

⇒ Hai form gọi **chung một endpoint** nhưng dùng **hai tên field khác nhau**; API chỉ hỗ trợ tên của `/my-work`.

### 1.2 File / dòng đã sửa

| File | Dòng | Nội dung sửa |
|---|---|---|
| `src/app/api/tasks/[id]/updates/route.ts` | toàn bộ `POST` | Viết lại: chuẩn hóa contract, transaction thống nhất, chống nộp trùng server-side |
| `src/server/task-transitions.ts` | ~30 | Thêm guard chặn lặp `WAITING_REVIEW → WAITING_REVIEW` (409) |
| `src/app/tasks/[id]/page.tsx` | 103–104, 550, 556, 777–782, 1424–1452 | Bỏ state `isSubmitReview`, reset modal, checkbox suy ra từ tiến độ, hướng dẫn + thông báo mới |
| `scripts/test-yc38-submit-approval.ts` | **mới** | 36 assertion E2E qua HTTP thật |

**Không** đổi schema, **không** thêm cột, **không** backfill.

### 1.3 Contract API mới (`POST /api/tasks/[id]/updates`)

| Client | Gửi gì | Kết quả |
|---|---|---|
| `/tasks/[id]` | `submitForReview: true` + `progressPercent` | **100%** ⇒ `WAITING_REVIEW` + `kind='submit'` · **<100%** ⇒ chỉ ghi nhật ký (giữ `IN_PROGRESS`), trả `earlySubmitNote` (đề xuất nghiệp vụ đang chờ xác nhận) |
| `/my-work` | `newStatus`/`statusAfter` | **giữ nguyên hành vi cũ** (được ưu tiên khi client chủ động chỉ định) |
| Mọi client | — | **Không bao giờ** tự chuyển `COMPLETED` (chỉ lãnh đạo nghiệm thu) |

### 1.4 Chống nộp trùng (server-side, 3 lớp)

1. **Khoá tư vấn 2 tầng**: `task-progress:{taskId}:{personId}` (bấm trùng) + `task-status:{taskId}` (2 người nộp đồng thời).
2. **Đọc lại trạng thái sau khi khoá** (chống TOCTOU) → nếu đã `WAITING_REVIEW` ⇒ **409** *"Nhiệm vụ này đã được trình Lãnh đạo phê duyệt — không thể trình lặp lại."*, **không** tạo thêm sự kiện.
3. **Guard tập trung** `assertTaskStatusTransition`: chặn `WAITING_REVIEW → WAITING_REVIEW` (409) cho mọi route.
4. Cơ chế chống trùng **15s** (cùng người + cùng % + cùng nội dung) **giữ nguyên**, tương thích.

### 1.5 Ghi lịch sử + đổi trạng thái trong CÙNG transaction

Trước: `taskUpdate.create` (transaction 1) → `prisma.task.update` (transaction 2) ⇒ có thể ghi một phần.
Sau: cả hai trong **một** `prisma.$transaction` cùng khoá ⇒ không còn trạng thái nửa vời.

### 1.6 Phân quyền (giữ + siết)

| Hành động | Quyền | Nơi chặn |
|---|---|---|
| Cập nhật tiến độ / nộp duyệt | Người có quyền thực hiện | `verifyTaskAccess(..., "WRITE")` |
| Tự nghiệm thu `COMPLETED` | **Chỉ lãnh đạo** | `assertTaskStatusTransition` (403) — cán bộ tự `COMPLETED` vẫn bị chặn |
| Trả lại / yêu cầu bổ sung | **Chỉ lãnh đạo** | `assertTaskStatusTransition` (403) |
| Nộp lặp lại | Không | 409 (API) + guard + thông báo ở giao diện |

### 1.7 UX modal (`/tasks/[id]`)

- **Bỏ state `isSubmitReview`** → trước `checked={isSubmitReview || newProgress === 100}` hiển thị đã tick nhưng state chưa đồng bộ (bỏ tick ở 100% vẫn gửi `true`). Nay tick **suy ra** từ `newProgress === 100` ⇒ không thể lệch.
- **Reset modal mỗi lần mở**: `setNewProgress(task?.progressPercent ?? 0)` + `setUpdateNotes("")` ⇒ không còn tick/tiến độ dính từ lần trước.
- **Hướng dẫn phản ánh đúng quy tắc**:
  - 100%: *"Đạt 100% — khi bấm 'Xác nhận cập nhật', hệ thống sẽ **NỘP KẾT QUẢ** chờ Lãnh đạo đơn vị phê duyệt. Cán bộ không tự kết luận hoàn thành."*
  - <100%: *"Dưới 100% — khi lưu chỉ cập nhật nhật ký, nhiệm vụ tiếp tục 'Đang thực hiện'. Trình duyệt sớm chưa triển khai (đề xuất nghiệp vụ đang chờ xác nhận)."*
- Nhiệm vụ đang chờ duyệt ⇒ hiện thông báo *"Nhiệm vụ đang chờ Lãnh đạo phê duyệt — không thể trình lặp lại."*
- Nhật ký phân biệt: `kind='submit'` → *"Nộp kết quả / Chờ duyệt"*; `kind='progress'` → *"Cập nhật tiến độ"* (`api/tasks/[id]/route.ts:185-193`).

---

## 2. TEST

### 2.1 Bộ mới — `scripts/test-yc38-submit-approval.ts` (E2E qua HTTP thật, DB local) — **36/36 ✔**

| # | Yêu cầu | Kết quả |
|---|---|---|
| 1 | 50% → `IN_PROGRESS`, `kind=progress` | ✔ HTTP 201 · status giữ nguyên · không có sự kiện submit |
| 2 | 100% → `WAITING_REVIEW`, `kind=submit` | ✔ HTTP 201 · `submitted=true` |
| 3 | Một lần nộp = đúng một sự kiện `submit` | ✔ n=1 |
| 4 | Gửi lại (cùng nội dung) | ✔ **409**, không tạo bản ghi thứ 2 |
| 5 | Gửi lại (nội dung khác) | ✔ **409**, vẫn n=1 |
| 6 | Gửi **3 request đồng thời** | ✔ đúng **1** sự kiện submit · HTTP `201,409,409` · không 500 |
| 7 | Vào hàng đợi lãnh đạo duyệt | ✔ xuất hiện trong `?status=WAITING_REVIEW` |
| 8 | Lãnh đạo duyệt hợp lệ | ✔ → `COMPLETED` + `kind='approve'` |
| 9 | Yêu cầu bổ sung → cập nhật & trình lại | ✔ `kind='return'` → `IN_PROGRESS` → trình lại → `WAITING_REVIEW` (mở lại vòng quyết định YC-37) |
| 10 | Người không đủ quyền tự hoàn thành | ✔ **403**, trạng thái không đổi |
| 11 | Luồng `/my-work` không bị ảnh hưởng | ✔ `newStatus/statusAfter` → `WAITING_REVIEW` + `kind='submit'` |
| 12 | Trình duyệt sớm ở 50% (chưa triển khai) | ✔ **không** chuyển `WAITING_REVIEW`; có `earlySubmitNote` giải thích |
| + | Kiểm tra tĩnh mã nguồn (checkbox đồng bộ, reset modal, chống trùng server, transaction, guard) | ✔ 6/6 |

### 2.2 Hồi quy YC-01→38 (không đổi)

| Bộ | Kết quả |
|---|---|
| `test-yc33-scoring-parity` | **38/38 ✔** |
| `test-yc33-scoring-flow` | **20/20 ✔** |
| `test-yc34-36-eval` | **32/32 ✔** |
| `test-yc37-approval-flow` | **25/25 ✔** |
| `test-yc38c-linkage` | **28/28 ✔** |
| `test-yc38-uat-origin-tx` | **23/23 ✔** |
| `test-yc38-datetime-tz` | **19/19 ✔** |
| `test-yc30-regression` (Production) | **56/56 ✔** |
| `test-yc33-36-production-smoke` (Production) | **23/23 ✔** |
| `tsc --noEmit` · `next build` | ✔ không lỗi · ✔ build thành công |

---

## 3. DỮ LIỆU TRƯỚC / SAU (Production, chỉ đọc)

| Đối tượng | Trước | Sau | Ghi chú |
|---|---|---|---|
| `NV-2026-0019.status` | `IN_PROGRESS` | **`IN_PROGRESS`** | ✔ **không tự chuyển** (đúng yêu cầu) |
| `NV-2026-0019` số `task_updates` | 4 | **4** | ✔ không xoá/sửa (kind: accept, progress, progress, progress) |
| `NV-2026-0019` `approval_case` | 0 | **0** | ✔ không tạo hồ sơ giả |
| `tasks` | 21 | 22 | +1 do **người kiểm thử** tạo (`NV-2026-0018`, 04:58Z) — **0 bản ghi test của agent** (đã kiểm tra: `task` có chuỗi `YC38-B4-TEST` = 0) |
| `personal_work_items` | 28 | 29 | +1 của người kiểm thử (`[UAT-YC38-03]`) |
| `monthly_work_results` | 15 | **15** | ✔ |
| `work_catalog_entries` | 348 | **348** | ✔ |
| `product_items` | 3.386 | **3.386** | ✔ |
| `activity_templates` | 48 | **48** | ✔ |
| `approval_case` | 2 | **2** | ✔ không sinh hồ sơ |
| `evaluation_assessments` | 3 | **3** | ✔ |
| Task `WAITING_REVIEW` | 0 | 0 | ✔ không có nhiệm vụ nào bị "kẹt" |
| Task `COMPLETED` | 8 | 8 | ✔ |
| Nhiệm vụ lệch 7h (chưa sửa) | 6 | **6** | `NV-2026-0011..0014`, `0016`, `0017` — giữ nguyên |

**An toàn:** không đổi schema ⇒ **không** cần DDL; không có lệnh ghi dữ liệu nghiệp vụ nào; các bản ghi test chỉ tồn tại ở DB local và đã được dọn trong script.

---

## 4. HƯỚNG DẪN UAT LẠI TRÊN `NV-2026-0019`

> Nhiệm vụ đang ở `IN_PROGRESS`, tiến độ 100%, 4 sự kiện lịch sử. **Người kiểm thử thực hiện lại trên giao diện.**

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở `/tasks/NV-2026-0019` → bấm **"Báo cáo tiến độ / Nộp kết quả"** | Modal mở với tiến độ **100%** (đã đồng bộ với dữ liệu), nội dung **trống** (không còn dính từ lần trước) |
| 2 | Quan sát ô tick | **Đã tick**, nhãn *"Nộp kết quả chờ Lãnh đạo đơn vị ký phê duyệt"*; hướng dẫn: *"Đạt 100% — khi bấm 'Xác nhận cập nhật', hệ thống sẽ NỘP KẾT QUẢ chờ Lãnh đạo đơn vị phê duyệt."* |
| 3 | Nhập nội dung báo cáo → bấm **"Xác nhận cập nhật"** | Thông báo *"Đã nộp kết quả và trình Lãnh đạo phê duyệt!"*; trạng thái nhiệm vụ chuyển **"Chờ duyệt"**; lịch sử có thêm sự kiện **"Nộp kết quả / Chờ duyệt"** |
| 4 | Bấm lại **"Xác nhận cập nhật"** (thử trùng) | Thông báo lỗi rõ ràng *"Nhiệm vụ này đã được trình Lãnh đạo phê duyệt — không thể trình lặp lại."*; **không** có sự kiện submit thứ 2 |
| 5 | Mở lại modal | Thông báo *"Nhiệm vụ đang chờ Lãnh đạo phê duyệt — không thể trình lặp lại."* |
| 6 | Lãnh đạo mở trang **"Phê duyệt"** | Nhiệm vụ xuất hiện trong hàng đợi *"Chờ nghiệm thu"* |
| 7 | Lãnh đạo duyệt hoàn thành | Nhiệm vụ → **"Hoàn thành"**; lịch sử có sự kiện *"Nghiệm thu hoàn thành"* |
| 8 | (tuỳ chọn) Lãnh đạo trả lại rồi cán bộ trình lại | Lịch sử: *"Trả lại yêu cầu hoàn thiện"* → cán bộ cập nhật 100% lần nữa → *"Nộp kết quả / Chờ duyệt"*, hồ sơ quyết định mở lại vòng mới |

**Lưu ý:** 3 bản ghi tiến độ cũ (50%, 100%, 100%) **được giữ nguyên** — không bị xoá. Lịch sử sẽ có thêm sự kiện `submit` mới; đây là dữ liệu thật của thao tác UAT, **không** phải sửa lịch sử cũ.

---

## 5. CẦN HẢI QUAN XÁC NHẬN

| # | Vấn đề | Trạng thái | Khuyến nghị |
|---|---|---|---|
| 1 | **Trình duyệt sớm khi tiến độ <100%** | ⛔ **Chưa triển khai** (checkbox bị khoá, API bỏ qua, trả ghi chú `earlySubmitNote`) | Nếu nghiệp vụ cần → chốt quy tắc (ai duyệt, có cho báo cáo tiến độ kèm không) rồi mới triển khai |
| 2 | Quy tắc **100% ⇒ tự trình duyệt** (đang áp dụng) | ✅ Đã triển khai theo hướng dẫn cũ | Xác nhận để chốt |
| 3 | **Cán bộ có được tự kết luận "đạt kết quả" ở mức <100% mà vẫn nộp duyệt không?** | ⛔ Chưa | Nếu có → thêm nút riêng *"Nộp duyệt kết quả hiện tại"* (hiện chưa có) |
| 4 | Hồ sơ `approval_case` cho nghiệm thu nhiệm vụ | ⚠️ Hồ sơ chỉ tạo khi lãnh đạo mở xem trước (YC-37) | Xác nhận có cần tạo hồ sơ ngay khi nộp không |
| 5 | `NV-2026-0019` | ⛔ Giữ nguyên `IN_PROGRESS` + 4 sự kiện | Người kiểm thử thao tác lại trên giao diện |
| 6 | 6 nhiệm vụ lệch 7h (`0011..0014`, `0016`, `0017`) | ⛔ Chưa sửa | Khuyến nghị: **không** sửa (điểm dùng `due_date` date-only) |
| 7 | Q-B4 (hệ số TX vs QĐ1277) · 48 mẫu · mẫu 2C · ca trực | ⛔ Chưa đổi | Xem báo cáo bàn giao YC-38B/38C |

---

## 6. KHAI BÁO

```
FIX_DEPLOYED        = YES (96be5e4, db=up)
SCHEMA_CHANGE       = NONE  (ưu tiên sửa code, không cần schema)
DATA_WRITES         = NONE cho dữ liệu lịch sử (NV-2026-0019 giữ nguyên; 0 bản ghi test của agent trên Production)
TEST_NEW            = PASS 36/36 (E2E HTTP thật)
REGRESSION_YC01_38  = PASS (38/20/32/25/28/23/19/56/23)
TYPECHECK_BUILD     = PASS
UAT_STATUS          = CHỜ UAT — người dùng thực hiện lại trên giao diện NV-2026-0019
```
