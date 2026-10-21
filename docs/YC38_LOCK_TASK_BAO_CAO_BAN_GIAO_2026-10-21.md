# YC-38 — BÁO CÁO BÀN GIAO BẢN VÁ F1–F5 (KHOÁ NHIỆM VỤ ĐÃ NGHIỆM THU)

**Ngày:** 21/10/2026 · **Commit:** `5901199` · **Production:** `{"status":"ok","db":"up","commit":"5901199"}`
**Phạm vi:** vá bảo mật/nghiệp vụ trước mắt — **không** đổi schema, **không** ghi dữ liệu, **không** xây quy trình mở lại.
**Trạng thái:** đã triển khai, đã test → **dừng chờ UAT**.

---

## 1. ROOT CAUSE & CÁC ENDPOINT ĐÃ KHOÁ

**Root cause:** `assertTaskStatusTransition` chỉ chặn `COMPLETED→COMPLETED`; **không** chặn `COMPLETED→IN_PROGRESS` / `COMPLETED→WAITING_REVIEW`;
`PATCH /api/tasks` action `SUBMIT_COMPLETION` **không** kiểm tra trạng thái hiện tại ⇒ người phối hợp (có `WRITE`) mở được modal ở `/my-work`
và **mở lại được nhiệm vụ đã nghiệm thu**, tạo sự kiện `submit` giả.

| Endpoint / điểm vào | Việc đã làm | Kết quả |
|---|---|---|
| `src/server/task-transitions.ts` (F1) | `TERMINAL_TASK_STATUSES` (COMPLETED/DONE/CANCELED) · `isTerminalTaskStatus()` · `assertTaskNotTerminal()` · chặn chuyển trạng thái **từ** trạng thái kết thúc | 409 cho mọi route dùng guard |
| `POST /api/tasks/[id]/updates` (F2) | chặn mọi ghi trên nhiệm vụ kết thúc; **đọc lại trạng thái trong transaction sau khoá**; phối hợp được ghi phần việc nhưng **không ghi đè kết quả chung** của chủ trì | 409, **không** tạo `task_update`, **không** đổi `tasks`/`work_item` |
| `PATCH /api/tasks` (F3) | chặn mọi action ghi (kể cả `SUBMIT_COMPLETION`, `ACCEPT_TASK`) trên nhiệm vụ kết thúc | 409 |
| `PATCH /api/tasks/[id]` (F1/F2) | chặn tương tự (bổ sung ngoài khóa nội dung sẵn có) | 409 |
| `POST /api/tasks/[id]/deadline-request` (F4) | chặn xin gia hạn trên nhiệm vụ kết thúc | 409 |
| `POST /api/tasks/[id]/attachments` (đường phụ) | chặn đính kèm thêm | 409 |
| `POST /api/tasks/[id]/comments` (đường phụ) | chặn bình luận/ghi chú thêm | 409 |
| `/my-work` (F5) | `openDrawerForTask` chặn mở modal; ẩn nút *"Tác nghiệp 1 chạm"*; drawer hiện chế độ chỉ xem | — |
| `/tasks` (F5) | ẩn hành động ghi (*Duyệt hạn*, *Đôn đốc*) | — |
| `/tasks/[id]` | đã khóa sẵn (`isLockedTask`) | — |

**Quyền được giữ nguyên (mục III):** người phối hợp **vẫn** xem được nhiệm vụ và **vẫn** ghi nhận phần việc của mình khi nhiệm vụ đang thực hiện;
**không** được ghi đè kết quả chung của chủ trì; **không** tự nghiệm thu (`COMPLETED` vẫn 403 với người không phải lãnh đạo);
quyền lãnh đạo duyệt/trả lại ở trạng thái hợp lệ **không đổi** (kiểm chứng: mục 12–13).

---

## 2. KIỂM THỬ

### 2.1 Bộ mới `scripts/test-yc38-locked-task.ts` — **15/15 ✔** (E2E HTTP thật, DB local)

| # | Yêu cầu | Kết quả |
|---|---|---|
| 1 | `COMPLETED → IN_PROGRESS` | ✔ 409 |
| 2 | `COMPLETED → WAITING_REVIEW` | ✔ 409 |
| 3 | `COMPLETED → COMPLETED` | ✔ 409, **không** ghi bản ghi mới (3→3) |
| 4 | Ghi đè `actualResultText` | ✔ 409, kết quả **không đổi** |
| 5 | `SUBMIT_COMPLETION` | ✔ 409, status giữ `COMPLETED` |
| 6 | Xin gia hạn | ✔ 409 |
| 7 | Người phối hợp không đổi được nhiệm vụ đã nghiệm thu | ✔ status/kết quả/lịch sử **không đổi** |
| 8 | Người chủ trì cũng không tự mở lại | ✔ 409 |
| 9 | Lãnh đạo không ghi đè kết quả đã duyệt qua API thường | ✔ 409, kết quả giữ nguyên |
| 10 | UI khóa thao tác | ✔ (`isTaskTerminal` ở `/my-work` + `/tasks`) |
| 11 | API kiểm tra lại trạng thái **lúc ghi** | ✔ đọc lại sau `advisoryLock` trong transaction |
| 12 | Luồng đang thực hiện → nộp duyệt → lãnh đạo duyệt | ✔ 201/200 → `COMPLETED` |
| 13 | Luồng trả lại **trước** nghiệm thu → trình lại | ✔ trả lại 200 → `IN_PROGRESS` → trình lại 201 → `WAITING_REVIEW` |

### 2.2 Hồi quy

| Bộ | Kết quả |
|---|---|
| `test-yc38-submit-approval` (B4) | **36/36 ✔** |
| `test-yc38-locked-task` (mới) | **15/15 ✔** |
| `test-yc38c-linkage` · `test-yc38-uat-origin-tx` · `test-yc38-datetime-tz` | **28/28 · 23/23 · 19/19 ✔** |
| `test-yc33-scoring-parity` · `-flow` · `test-yc34-36-eval` · `test-yc37-approval-flow` | **38/38 · 20/20 · 32/32 · 25/25 ✔** |
| `tsc --noEmit` · `next build` | ✔ không lỗi · ✔ build thành công |
| `test-yc30-regression` · `test-yc33-36-production-smoke` (HTTP Production) | ⚠️ **không chạy được — lỗi MÔI TRƯỜNG, không phải hồi quy**: mật khẩu 3 tài khoản demo trên Production đã được đổi (hash trong DB ≠ `demo-ops/demo-secrets.json`) ⇒ **401 khi đăng nhập**. Cần cập nhật lại file secrets (không tự sửa mật khẩu Production) |

---

## 3. RÀ SOÁT LỊCH SỬ (chỉ đọc)

| Kiểm tra | Kết quả |
|---|---|
| 9 nhiệm vụ `COMPLETED` | `NV-14468014`, `NV-2026-0001`, `0006`, `0007`, `0011`, `0012`, `0013`, `0014`, `0019` — có kết quả (trừ `NV-14468014` không có `actualResultText`), số sự kiện 1–5, **không có dấu hiệu bất thường** |
| `task_update` có `statusBefore` = trạng thái kết thúc nhưng `statusAfter` khác | **0** |
| `audit_event` có `oldStatus` = trạng thái kết thúc → `newStatus` khác | **0** |
| Nhiệm vụ `COMPLETED` có ≥2 sự kiện `submit` (dấu hiệu mở lại) | **0** |

⇒ **Chưa từng có nhiệm vụ nào bị mở lại** ⇒ **không cần sửa/backfill dữ liệu**.
`NV-2026-0019` giữ nguyên: `COMPLETED` · 5 `task_update` · 6 `audit` · 1 `approval_case`.

---

## 4. DỮ LIỆU & AN TOÀN

- Backup toàn bộ 74 model / **7.531** bản ghi + **RESTORE-TEST PASS** trước khi sửa (không đổi schema ⇒ không cần DDL).
- **Không** ghi dữ liệu nghiệp vụ, **không** backfill, **không** xoá bản ghi UAT.
- Counts Production sau deploy: `task 22` · `work_items 30` · `monthly 15` · `TX 348` · `SP 3.386` · `48 mẫu` · `COMPLETED 9` · `WAITING_REVIEW 0` (2 task + 1 work item mới do **người kiểm thử** tạo trong lúc UAT).

---

## 5. KẾ HOẠCH UAT (KHÔNG GHI DỮ LIỆU VÀO NHIỆM VỤ ĐÃ NGHIỆM THU)

> Người kiểm thử **không** bấm các nút ghi trên `NV-2026-0019`; chỉ **quan sát giao diện**.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | `/my-work` → tìm `NV-2026-0019` (tab *Đã hoàn thành*) | Nút **"Tác nghiệp 1 chạm"** **không còn** |
| 2 | Bấm vào tiêu đề nhiệm vụ | **Không** mở modal; hiện thông báo *"Nhiệm vụ đã được nghiệm thu — không thể cập nhật tiến độ hoặc nộp lại."* |
| 3 | `/tasks/NV-2026-0019` | Vẫn xem đủ kết quả, lịch sử, quyết định nghiệm thu; **không** có nút *Lưu nháp* / *Báo hoàn thành* / *Trình duyệt* / *Xin gia hạn* |
| 4 | `/tasks` → dòng `NV-2026-0019` | Cột thao tác chỉ còn *Chi tiết*; không có *Duyệt hạn* / *Đôn đốc* |
| 5 | Kiểm tra quyền | Cán bộ **vẫn** thấy & cập nhật được phần việc của mình ở nhiệm vụ **đang thực hiện**; lãnh đạo **vẫn** duyệt/trả lại được nhiệm vụ **đang chờ duyệt** |

---

## 6. CẦN HẢI QUAN XÁC NHẬN

| # | Vấn đề | Trạng thái | Khuyến nghị |
|---|---|---|---|
| 1 | **Bình luận / minh chứng bổ sung** trên nhiệm vụ đã nghiệm thu | ⛔ **Đang chặn** (fail-closed) vì chưa có chính sách | Chốt chính sách: có cho bình luận kèm hồ sơ nghiệm thu không; nếu có → mở lại riêng 2 endpoint này |
| 2 | **Quy trình mở lại** nhiệm vụ đã nghiệm thu | ⛔ Chưa xây dựng (theo phạm vi bản vá này) | Khi có: chỉ lãnh đạo yêu cầu · ghi `kind='return'` + audit · task → `WAITING_REVIEW` · mở lại vòng `approval_case` · không ghi đè kết quả cũ |
| 3 | `demo-ops/demo-secrets.json` không khớp mật khẩu tài khoản demo trên Production | ⚠️ 2 bộ test HTTP Production không chạy được | Cập nhật lại file secrets (ngoài Git) — **không** tự đặt lại mật khẩu Production |
| 4 | Ghi đè kết quả chung của chủ trì | ✅ Đã chặn (người phối hợp chỉ ghi phần việc của mình) | Xác nhận |
| 5 | Module RBAC/Scope/Policy | ⛔ Ngoài phạm vi bản vá này | Theo yêu cầu tiếp theo |

---

```
FIX_DEPLOYED       = YES (5901199, db=up)
SCHEMA_CHANGE     = NONE
DATA_WRITES       = NONE (NV-2026-0019 giữ nguyên; 0 bản ghi test của agent trên Production)
BACKUP            = 74 model / 7.531 bản ghi + RESTORE-TEST PASS
TEST_NEW          = PASS 15/15
REGRESSION_LOCAL  = PASS (36/28/23/19/38/20/32/25)
REGRESSION_PROD   = KHÔNG CHẠY ĐƯỢC (sai mật khẩu tài khoản demo — lỗi môi trường, không phải hồi quy)
UAT_STATUS        = CHỜ UAT — không tự thao tác với NV-2026-0019
```
