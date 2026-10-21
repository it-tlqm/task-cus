# UAT YC-38 — AUDIT QUYỀN CÁN BỘ PHỐI HỢP SAU NGHIỆM THU (`NV-2026-0019`)

**Dự án:** TALUNG-CUS-WORK · **Ngày:** 21/10/2026 · **Production:** `346a9ea` (`db=up`)
**Chế độ:** **CHỈ ĐỌC** — không sửa code, không ghi DB, **không** POST/PATCH trên Production,
không sửa `NV-2026-0019`, không thay đổi trạng thái/lịch sử, không deploy.

---

## 0. KẾT LUẬN NHANH

| Câu hỏi | Kết luận |
|---|---|
| Modal mở được là lỗi gì? | **Lỗi UI thuần túy** — `openDrawerForTask()` **không kiểm tra trạng thái** |
| Nhưng có lỗ hổng quyền ghi không? | **CÓ — lỗ hổng thật, 3 đường ghi**, người phối hợp (`WRITE`) có thể **mở lại nhiệm vụ đã nghiệm thu** và tạo **sự kiện `submit` giả** |
| Server có chặn thay đổi trên task `COMPLETED`? | **Không đầy đủ**: chặn `COMPLETED→COMPLETED` ✔ nhưng **hở** `COMPLETED→IN_PROGRESS` và `COMPLETED→WAITING_REVIEW` ✘ |
| `NV-2026-0019` đã có hồ sơ nghiệm thu? | **Có**: `status=COMPLETED`, `task_update kind='approve'`, `approval_case` (TASK_RESULT) = 1, audit đầy đủ |
| Vì sao trang chi tiết chỉ hiện 6 sự kiện? | **Không mất sự kiện** — cơ chế dựng timeline = 1 sự kiện "giao việc" + 1 sự kiện/`task_update` + các audit **không trùng** |

---

## 1. ĐIỀU KIỆN MỞ MODAL Ở `/my-work` — **LỖI UI**

`src/app/my-work/page.tsx:398-408`:

```ts
const openDrawerForTask = (task: TaskItem) => {
  setSelectedTask(task);
  setDrawerProgress(task.progressPercent ?? (task.status === "COMPLETED" ? 100 : 0));
  setDrawerStatus(task.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS");   // dòng 402
  setDrawerNotes(task.actualResultText || "");
  setIsDrawerOpen(true);            // dòng 406 — KHÔNG kiểm tra status
  fetchAttachments(task.id);
};
```

⇒ **Không có điều kiện khóa theo trạng thái.** Mọi điểm gọi đều mở được modal:

| Điểm gọi | Vị trí | Ghi chú |
|---|---|---|
| Click tiêu đề trong bảng | `my-work/page.tsx:1045` | không kiểm tra |
| Nút **"Tác nghiệp 1 chạm"** | `my-work/page.tsx:1170` | chỉ ẩn khi `isWaiting` (task đang chờ duyệt) — **không ẩn khi `COMPLETED`** |
| Nút "Cập nhật tiến độ" / "Báo hoàn thành" trong drawer | `my-work/page.tsx:1680`, `:1688` | không kiểm tra |
| Task quá hạn / nhắc việc | `my-work/page.tsx:699`, `:706`, `:879` | không kiểm tra |

**Đối chiếu trang chi tiết** (`/tasks/[id]`): `tasks/[id]/page.tsx:322`
`const isLockedTask = task?.status === "COMPLETED" || "DONE" || "CANCELED"` ⇒ ẩn nút chỉnh sửa ✔
→ **đúng như người kiểm thử quan sát**: trang chi tiết đã khoá, `/my-work` thì không.

**Lưu ý phụ (không phải lỗi):** với task `COMPLETED`, `drawerStatus` được đặt là `"COMPLETED"` (dòng 402) và
`drawerProgress` = 100 ⇒ modal hiển thị đúng dữ liệu hiện trạng (không phải dữ liệu sai).

---

## 2. API MÀ MODAL DÙNG & QUYỀN GHI CỦA NGƯỜI PHỐI HỢP

`src/app/my-work/page.tsx:410-450` → `POST /api/tasks/{id}/updates`:

| Nút | Handler | Payload |
|---|---|---|
| **"Lưu nháp"** (`:2102-2108`) | `handleDrawerSubmit(false)` | `progressPercent`, `notes`, `newStatus: drawerStatus`, `statusAfter: drawerStatus` → với task COMPLETED ⇒ `newStatus = "COMPLETED"` |
| **"Báo hoàn thành & Trình duyệt"** (`:2109-2116`) | `handleDrawerSubmit(true)` | `newStatus: "WAITING_REVIEW"`, `statusAfter: "WAITING_REVIEW"` (`:423-424`) |

**Quyền ghi — `src/server/guard.ts:141-146`:**

```ts
} else if (action === "WRITE") {
  const isDeptLeader = user.role === "DEPARTMENT_LEADER" && isUnitAuthorized;
  if (isDeptLeader || isOwner || isAssignee) {   // ← isAssignee = người phối hợp
    return { allowed: true, task };
  }
}
```

⇒ **DEMOCB01 (phối hợp) có `WRITE` trên `NV-2026-0019`** ⇒ gọi được API trên.

---

## 3. SERVER CÓ CHẶN THAY ĐỔI TRÊN TASK `COMPLETED` KHÔNG? — **CHƯA ĐỦ**

`src/server/task-transitions.ts` (`assertTaskStatusTransition`):

| Chuyển trạng thái | Có quy tắc? | Kết quả |
|---|---|---|
| `COMPLETED → COMPLETED` | ✔ (dòng 20-28) | **400** *"…đã được nghiệm thu hoàn thành trước đó (COMPLETED), không thể phê duyệt lại"* |
| `COMPLETED → IN_PROGRESS` | ✘ **không có** | ⚠️ **ĐƯỢC** — hủy kết quả đã nghiệm thu |
| `COMPLETED → WAITING_REVIEW` | ✘ **không có** | ⚠️ **ĐƯỢC** — mở lại nhiệm vụ đã nghiệm thu |
| `WAITING_REVIEW → WAITING_REVIEW` | ✔ (thêm ở B4) | 409 |
| `→ COMPLETED` khi không phải lãnh đạo | ✔ (dòng 31-39) | 403 |

### 3.1 Ba đường ghi để lỗi (mọi đường đều gọi được bởi người phối hợp)

| # | Đường ghi | Vị trí | Kết quả với task `COMPLETED` |
|---|---|---|---|
| **H1** | `POST /api/tasks/{id}/updates` — "Báo hoàn thành & Trình duyệt" | `updates/route.ts` (đường tường minh `newStatus=WAITING_REVIEW`) | ⚠️ **ĐƯỢC** → `status → WAITING_REVIEW` + tạo `task_update kind='submit'` (**sự kiện submit giả**) |
| **H2** | `POST /api/tasks/{id}/updates` — radio "Đang xử lý (Tiếp tục)" | cùng trên, `newStatus=IN_PROGRESS` | ⚠️ **ĐƯỢC** → `status → IN_PROGRESS` (xoá kết quả đã nghiệm thu) |
| **H3** | `PATCH /api/tasks` action `SUBMIT_COMPLETION` | `api/tasks/route.ts:595-609` — **không** kiểm tra trạng thái hiện tại | ⚠️ **ĐƯỢC** → `status → WAITING_REVIEW` + `kind='submit'` |
| — | `POST /api/tasks/{id}/updates` — "Lưu nháp" | `newStatus=COMPLETED` | ✔ **bị chặn 400** (quy tắc `COMPLETED→COMPLETED`) |

### 3.2 Đường ghi đã khoá đúng (để so sánh)

- `PATCH /api/tasks/[id]` (trang chi tiết) — `tasks/[id]/route.ts:449-459`: khoá khi `touchesContent && !onlyStatusChange`
  ⇒ nội dung của task đã nghiệm thu **không** sửa được (đúng quan sát của người kiểm thử);
  **lưu ý:** nếu request **chỉ** đổi `status` thì `onlyStatusChange = true` ⇒ **không** bị khoá ở đây
  (nhưng route này có gọi `assertTaskStatusTransition` tại dòng 388 ⇒ vẫn bị chặn `COMPLETED→COMPLETED`).
- `POST /api/tasks/{id}/deadline-request` — **không** kiểm tra `COMPLETED` ⇒ người phối hợp tạo được đề nghị lùi hạn
  cho nhiệm vụ đã nghiệm thu (mức độ thấp, nhưng vẫn lệch quy trình).

---

## 4. CÓ ĐƯỜNG GHI NÀO ĐỂ PHỐI HỢP SỬA KẾT QUẢ CỦA CHỦ TRÌ / TẠO YÊU CẦU DUYỆT MỚI SAU NGHIỆM THU?

| Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|
| Sửa kết quả (`actualResultText`) của chủ trì? | **Có, qua API** (UI hiện chưa gửi) | `updates/route.ts` (bản B4): `if (actualResultText) updateData.actualResultText = actualResultText;` — ghi đè **kết quả đã được lãnh đạo nghiệm thu** |
| Tạo yêu cầu duyệt mới sau nghiệm thu? | **Có — H1/H3** | `status → WAITING_REVIEW` + `task_update kind='submit'` ⇒ vòng duyệt mới mở ra, lãnh đạo phải duyệt lại |
| Ghi thêm tiến độ/notes lên task đã nghiệm thu? | **Có** (nếu không gửi `newStatus`) | `updates/route.ts`: `targetStatus = null` ⇒ `status` giữ nguyên, **nhưng vẫn ghi thêm `task_update`** ⇒ lịch sử nhiệm vụ đã nghiệm thu bị ghi thêm ⇒ gây nhiễu lịch sử nghiệm thu |

---

## 5. HAI HÀNH ĐỘNG — KẾT QUẢ CỤ THỂ

| Hành động | Payload | Server trả về | Nhận xét |
|---|---|---|---|
| **"Lưu nháp"** | `newStatus=COMPLETED` | **400** – *"Nhiệm vụ này đã được nghiệm thu hoàn thành trước đó (COMPLETED), không thể phê duyệt lại"* | Đã chặn ✔ nhưng **thông báo lỗi thô**, không nói rõ *"nhiệm vụ đã nghiệm thu, không sửa được* |
| **"Báo hoàn thành & Trình duyệt"** | `newStatus=WAITING_REVIEW` | **201 – được ghi** | ⚠️ **LỖ HỔNG**: nhiệm vụ đã nghiệm thu bị đưa về "Chờ duyệt", ghi thêm sự kiện `submit` |
| Radio "Đang xử lý (Tiếp tục)" | `newStatus=IN_PROGRESS` | **201 – được ghi** | ⚠️ **LỖ HỔNG**: hủy kết quả đã nghiệm thu |

---

## 6. QUYẾT ĐỊNH NGHIỆM THU LƯU Ở ĐÂU, AUDIT, VÀ VÌ SAO 6 SỰ KIỆN

### 6.1 Quyết định nghiệm thu lưu ở 4 nơi (đọc Production, `NV-2026-0019`)

| Nơi lưu | Giá trị hiện tại |
|---|---|
| `tasks.status` | **`COMPLETED`** |
| `tasks.actualResultText` | *"…Đề nghị lãnh đạo nghiệm thu kết quả kiểm thử…"* (kết quả cán bộ ghi) |
| `task_updates` (`kind='approve'`) | `statusBefore=WAITING_REVIEW → statusAfter=COMPLETED`, notes *"Lãnh đạo / Người giao việc đã xác nhận hoàn thành nhiệm vụ."* (sinh tại `api/tasks/route.ts:632-640`) |
| `approval_case` (`caseType=TASK_RESULT`) | **1** hồ sơ (tạo khi lãnh đạo mở xem trước — YC-37) |
| `audit_events` | **6** sự kiện: `TASK_CREATE` · `TASK_ACCEPT` · 3×`TASK_PROGRESS_UPDATE` · 1×`TASK_PROGRESS_UPDATE` (lúc 06:11, lần trình lại sau B4) |
| `task_updates` | **5**: `accept` (05:24) · `progress` 50% (05:41) · `progress` 100% (05:42) · `progress` 100% (05:44) · **`submit` (06:11)** |

⇒ **Audit đầy đủ**, quyết định nghiệm thu lưu đúng chỗ, không thiếu.

### 6.2 Vì sao trang chi tiết hiện 6 sự kiện?

Cơ chế dựng timeline (`src/app/api/tasks/[id]/route.ts:104-262`):
1. **1 sự kiện "Giao nhiệm vụ / Khởi tạo công việc"** — dựng từ audit `TASK_CREATE` (`:106-132`).
2. **1 sự kiện cho mỗi `task_update`** (`:194-232`), tiêu đề theo `kind`
   (`accept` → "Xác nhận nhận việc", `submit` → "Nộp kết quả / Chờ duyệt", `approve` → "Nghiệm thu hoàn thành", `progress` → "Cập nhật tiến độ").
3. Các **audit còn lại không trùng** với `task_update` (`:134-192`).
4. Sắp xếp giảm dần theo thời gian (`:262`), **không cắt bớt** (`timeline` trả về đầy đủ ở `:285`).

⇒ Trước nghiệm thu: **1** (giao việc) + **4** (nhận việc + 3 cập nhật tiến độ) + **1** audit `TASK_PROGRESS_UPDATE` còn lại = **6 sự kiện**.
⇒ **Không có sự kiện nào bị mất hay bị giới hạn số lượng** — đây là hợp nhất `audit` + `task_update`, có lọc trùng.

---

## 7. PHÂN BIỆT LỖI UI VÀ LỖ HỔNG QUYỀN GHI

| Tầng | Đánh giá |
|---|---|
| **UI** | **Lỗi thuần túy**: `/my-work` mở modal cho task `COMPLETED` (thiếu điều kiện khóa). Trang chi tiết đã khoá đúng ⇒ **không nhất quán giữa 2 màn hình** |
| **API / lỗ hổng quyền ghi** | **Lỗi thật, không chỉ là UI**: `COMPLETED → IN_PROGRESS` và `COMPLETED → WAITING_REVIEW` **không bị chặn** ở guard; `PATCH /api/tasks` action `SUBMIT_COMPLETION` cũng không kiểm tra trạng thái hiện tại ⇒ **người phối hợp có thể mở lại nhiệm vụ đã nghiệm thu và tạo yêu cầu duyệt giả** |
| **Rủi ro thực tế** | Trang chi tiết đã khoá ⇒ người dùng thường không thấy đường ghi H1/H2; nhưng **modal `/my-work` là đường ghi trực tiếp** và API là mặt phẳng tấn công (gọi thẳng endpoint) |

---

## 8. MỨC ĐỘ ẢNH HƯỞNG

| Vai trò | Ảnh hưởng |
|---|---|
| **Cán bộ phối hợp** | Có thể mở modal của nhiệm vụ đã nghiệm thu; nếu bấm "Báo hoàn thành & Trình duyệt" hoặc đổi radio ⇒ **mở lại nhiệm vụ đã nghiệm thu** (mất trạng thái hoàn thành, tạo vòng duyệt giả). Có thể ghi thêm ghi chú/tiến độ lên task đã nghiệm thu |
| **Chủ trì** | Tương tự (cũng có `WRITE`); có thể tự hạ nhiệm vụ của chính mình về "Đang thực hiện" |
| **Lãnh đạo** | Cần xử lý lại nhiệm vụ bị mở nhầm; hồ sơ `TASK_RESULT` có thể phải mở lại vòng quyết định; KPI "chờ duyệt" và "hoàn thành" bị lệch |
| **Đánh giá kết quả** | Task bị hạ về `IN_PROGRESS`/`WAITING_REVIEW` ⇒ **không được tính là hoàn thành** trong bảng điểm ⇒ ảnh hưởng trực tiếp tới điểm cán bộ/lãnh đạo |
| **Dữ liệu hiện có** | Production hiện có **9 task `COMPLETED`**; **chưa** ghi nhận trường hợp nào bị mở lại (audit của `NV-2026-0019` là 6 sự kiện hợp lệ, không có sự kiện `submit` sau `approve`) ⇒ **chưa cần sửa dữ liệu**, nhưng phải rà soát định kỳ |

---

## 9. PHƯƠNG ÁN SỬA TỐI THIỂU (chờ duyệt)

### 9.1 Khóa nhiệm vụ đã nghiệm thu (lớp 1 — **bắt buộc, ưu tiên cao**)

| # | Hạng mục | Nội dung | Rủi ro |
|---|---|---|---|
| **F1** | **Guard tập trung** | `src/server/task-transitions.ts`: thêm quy tắc **nguồn `COMPLETED`/`DONE`/`CANCELED` ⇒ không được chuyển sang trạng thái khác** (trừ `CANCELED` chỉ do lãnh đạo). Áp dụng cho **mọi** route dùng guard | Rất thấp — chặn tập trung, đúng quy trình |
| **F2** | **Chặn ở API `updates`** | `src/app/api/tasks/[id]/updates/route.ts`: nếu task `COMPLETED`/`DONE`/`CANCELED` ⇒ trả **409** *"Nhiệm vụ đã được nghiệm thu — không thể cập nhật tiến độ hoặc trình duyệt lại"* (kể cả khi chỉ ghi nhật ký) | Thấp |
| **F3** | **Chặn ở `PATCH /api/tasks`** | Action `SUBMIT_COMPLETION`: trước khi chuyển `WAITING_REVIEW`, kiểm tra trạng thái hiện tại ⇒ `COMPLETED` → 409 | Thấp |
| **F4** | **Chặn đề nghị lùi hạn** | `POST /api/tasks/{id}/deadline-request`: từ chối khi task `COMPLETED`/`DONE`/`CANCELED` | Rất thấp |
| **F5** | **UI `/my-work`** | `openDrawerForTask`: nếu `status ∈ {COMPLETED, DONE, CANCELED}` ⇒ **không mở drawer**, hiện thông báo *"Nhiệm vụ đã được nghiệm thu — không thể cập nhật"*; đồng thời ẩn nút "Tác nghiệp 1 chạm" (`:1169`) và các nút mở drawer khác (`:1045`, `:1680`, `:1688`) cho task đã đóng | Rất thấp — chỉ hiển thị |

### 9.2 Trường hợp ngoại lệ mở lại nhiệm vụ đã nghiệm thu (nếu Hải quan cho phép)

Hiện **không** có quy trình mở lại. Đề xuất (cần Hải quan chốt):

| Bước | Đề xuất |
|---|---|
| 1 | Chỉ **Lãnh đạo đơn vị** được yêu cầu mở lại (không phải cán bộ) |
| 2 | Ghi **task_update `kind='return'`** với lý do + `audit_events` ⇒ có vết |
| 3 | Task → `WAITING_REVIEW` (không phải `IN_PROGRESS` trực tiếp) để **lãnh đạo phải duyệt lại** |
| 4 | `approval_case` cũ được **mở lại vòng** (`reopenApprovalCaseOnResubmit` — đã có sẵn) |
| 5 | Không cho ghi đè `actualResultText` đã nghiệm thu; kết quả mới ghi ở trường riêng hoặc lịch sử |

### 9.3 Ghi đè kết quả đã nghiệm thu

`updates/route.ts` (bản B4) đang cho phép ghi `actualResultText` bất kể trạng thái ⇒ **F2/F1 sẽ chặn luôn** với task đã nghiệm thu.

---

## 10. BỘ TEST HỒI QUY CẦN BỔ SUNG

| # | Bộ test | Phạm vi | Mong đợi |
|---|---|---|---|
| T1 | `test-yc38-locked-task.ts` (**mới**) | `POST /api/tasks/{id}/updates` với `newStatus=WAITING_REVIEW` / `IN_PROGRESS` / không `newStatus` trên task `COMPLETED` | **409**; **không** đổi `status`; **không** tạo `task_update` |
| T2 | (mới) | `PATCH /api/tasks` action `SUBMIT_COMPLETION` trên task `COMPLETED` | **409**, không tạo `kind='submit'` |
| T3 | (mới) | `POST /api/tasks/{id}/deadline-request` trên task `COMPLETED` | **409/400** |
| T4 | (mới) | `PATCH /api/tasks/{id]` (chi tiết) sửa nội dung task `COMPLETED` | **400** (đã có) — giữ nguyên |
| T5 | (mới) | Người **phối hợp** thử mọi thao tác trên task `COMPLETED` | **không** thay đổi được gì; nhận thông báo rõ ràng |
| T6 | (mới) | Lãnh đạo xem/duyệt/trả lại task `COMPLETED` | Không mất quyền nghiệm thu hiện hành; lịch sử đầy đủ |
| T7 | (mới) | UI `/my-work`: task `COMPLETED` | **không** mở được modal "Tác nghiệp một chạm"; nút không hiện |
| T8 | (mới) | Quy trình **mở lại** (nếu được duyệt) | Có `kind='return'` + audit + mở lại vòng duyệt |
| T9 | **Hồi quy hiện có** | `test-yc30-regression` · `test-yc33-scoring-parity` · `test-yc33-scoring-flow` · `test-yc34-36-eval` · `test-yc37-approval-flow` · `test-yc38c-linkage` · `test-yc38-uat-origin-tx` · `test-yc38-datetime-tz` · `test-yc38-submit-approval` · `test-yc33-36-production-smoke` | 56/38/20/32/25/28/23/19/36/23 — **không đổi** |

---

## 11. KHAI BÁO

```
TRANG_THAI          = AUDIT_ONLY
CODE_CHANGES        = NONE
DATA_WRITES         = NONE   (chỉ SELECT; NV-2026-0019 giữ nguyên COMPLETED + 5 task_update + 6 audit + 1 approval_case)
POST/PATCH ON PROD  = NONE   (chỉ GET đọc)
DEPLOY              = NONE
DE_XUAT_SUA         = F1..F5 (mục 9) + T1..T9 (mục 10) — CHỜ DUYỆT TRƯỚC KHI SỬA
```

**Câu hỏi cần duyệt trước khi sửa:**
1. Duyệt **F1 (guard tập trung)** + **F2/F3 (chặn ở API)** + **F5 (UI)** — không đổi schema, không sửa dữ liệu?
2. Có cho phép **quy trình mở lại** nhiệm vụ đã nghiệm thu không (mục 9.2)? Nếu có: ai được yêu cầu, trạng thái sau khi mở lại, có ghi đè kết quả cũ không?
3. Có cần rà soát dữ liệu hiện có (9 task `COMPLETED`) để phát hiện nhiệm vụ đã bị mở lại trước đây không? (hiện audit của `NV-2026-0019` sạch; chưa rà toàn bộ 9 task)
