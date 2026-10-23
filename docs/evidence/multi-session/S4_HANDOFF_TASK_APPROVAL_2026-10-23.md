# S4 — HANDOFF TASK & APPROVAL HARDENING (YC-08 / hotfix YC-09 / YC-12)

**Ngày:** 23/10/2026  
**Worktree:** `D:\thanhnx\OpenCode\talung-task-approval`  
**Branch:** `codex/v3-task-approval-history`  
**DB test:** `talung_v3_task_approval` (localhost) — port `3114`  
**Production touched:** **NO**

```text
SESSION: S4
YC: YC-08; hotfix an toàn YC-09; YC-12 phần đã rõ
BRANCH: codex/v3-task-approval-history
BASE_SHA: 50daed3 (docs) / a68d31e (code baseline)
COMMIT_SHA: e19818732fbdf412698fb63f6aff4b0338dd230e
FILES_CHANGED:
  src/server/task-transitions.ts
  src/server/approval-case.ts
  src/app/api/tasks/route.ts
  src/app/api/tasks/[id]/route.ts
  src/app/api/tasks/[id]/updates/route.ts
  src/app/api/tasks/[id]/deadline-request/[reqId]/review/route.ts
  src/app/api/approvals/cases/route.ts
  src/app/api/personal-work-items/review-queue/route.ts
  src/app/approvals/page.tsx
  src/app/tasks/[id]/page.tsx
  src/app/my-work/page.tsx
  src/app/work-item-reviews/page.tsx
  scripts/test-v3-task-approval-hardening.ts (mới)
  scripts/test-v3-no-self-approval.ts (sửa assertion AGREED)
  scripts/test-yc37-approval-flow.ts (fixture owner ≠ người duyệt)
SCHEMA_OR_MIGRATION: KHÔNG có thay đổi schema/migration
```

## 1. Phạm vi đã làm

### YC-09 — hotfix an toàn

- Chặn tự duyệt trên mọi đường Task:
  - `POST /api/approvals/TASK_RESULT/[id]/decision`
  - `PATCH /api/tasks` với `CONFIRM_COMPLETION`
  - `PATCH /api/tasks/[id]` với `status=COMPLETED/DONE`
  - `POST /api/tasks/[id]/updates` với status `COMPLETED/DONE`
  - Quick approve đề nghị gia hạn `deadline-request/[reqId]/review`
- Whitelist trạng thái Task ở server; không nhận trạng thái lạ/`CANCELED` tự do.
- Người phối hợp bị chặn:
  - ghi đè `actualResultText` (trả lỗi, không báo success giả);
  - nộp thay chủ trì (`SUBMIT_COMPLETION`, `submitForReview`, status `WAITING_REVIEW`);
  - đổi danh sách người phối hợp;
  - hủy nhiệm vụ.
- Kết quả đã trình duyệt (`WAITING_REVIEW`) bị khóa, không sửa lén trước khi lãnh đạo quyết định.
- Quick approve gia hạn đi qua `decideApproval` để không bỏ qua `ApprovalCase`.

### YC-08 — projection phê duyệt

- `decideApproval` ghi đồng thời trong một transaction:
  - `ApprovalCase` + `ApprovalDecision`;
  - hiệu ứng trạng thái Task;
  - `TaskUpdate` `kind=approve` hoặc `kind=return` kèm người/thời gian/lý do;
  - không reset tiến độ/kết quả khi trả lại.
- Thông báo cho **chủ trì + người phối hợp**, deep link `/tasks/[id]`.
- API danh sách/chi tiết Task trả `approval` summary: hành động, người quyết định, thời gian, lý do/nội dung.
- UI:
  - badge “Bị trả lại” + lý do ở `/tasks/[id]` và `/my-work`;
  - trạng thái “Đã báo hoàn thành — chờ duyệt”;
  - ẩn thao tác nộp/sửa khi hồ sơ đang chờ duyệt;
  - bỏ nút “Thu hồi” sai quyền trên thẻ mobile.

### YC-12 — lịch sử theo thẩm quyền

- `/work-item-reviews`:
  - badge theo `reviewState` (Chờ xác nhận / Đã xác nhận / Đã trả lại);
  - chỉ hiện nút duyệt khi `SUBMITTED` và đúng tuyến trực tiếp;
  - hiển thị `reviewedBy` + thời gian + lý do;
  - lọc theo mã/tên cán bộ + tháng + năm;
  - người đã ra quyết định vẫn xem được lịch sử khi tuyến phụ trách thay đổi.
- `/approvals` có khối **“Đã xử lý”**, lọc cán bộ/tháng/năm, hiển thị người trình, người quyết định, thời gian, lý do.
- API mới: `GET /api/approvals/cases?scope=decided&person=&month=&year=`.
- Không đếm trùng nguồn; không hợp nhất lịch sử toàn bộ workflow (E12 vẫn mở).

## 2. Test đã chạy trên DB test

| Bộ test | Kết quả |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `pnpm build` | PASS (98 trang) |
| `scripts/test-v3-task-approval-hardening.ts` | **40/40 PASS** |
| `scripts/test-v3-no-self-approval.ts` | **5/5 PASS** |
| `scripts/test-task-transitions.ts` | **10/10 PASS** |
| `scripts/test-yc37-approval-flow.ts` | **25/25 PASS** |
| `scripts/test-yc38-submit-approval.ts` | **36/36 PASS** |
| `scripts/test-yc38-locked-task.ts` | **15/15 PASS** |
| `scripts/test-v3-review-flow.ts` | **38/38 PASS** |
| `scripts/test-v3-e2e-flow.ts` | **40/40 PASS** |

Test chưa chạy:
- Toàn bộ bộ regression lịch sử 471 test (không có trong baseline S0).
- UI screenshot tự động: chưa chụp; đã xác minh qua build + API projection. Đề nghị S0 chụp UAT `/approvals`, `/work-item-reviews`, `/tasks/[id]`, `/my-work`.

Ghi chú test:
- `test-v3-no-self-approval.ts` trước đây so sánh sai `APPROVED` (giá trị không tồn tại) nên PASS giả. Đã sửa thành `AGREED` và kiểm tra thêm không có `ApprovalDecision` tự duyệt.
- `test-yc37-approval-flow.ts` trước đây chọn nhầm chính lãnh đạo làm “cán bộ”, dẫn tới test tự duyệt. Đã sửa fixture để người chủ trì khác người quyết định.

## 3. SECURITY_CHECKS

- Không tự duyệt qua 5 đường Task/quick approve.
- Collaborator không ghi đè kết quả, không nộp thay, không đổi assignee, không hủy Task.
- API trả 403/409 và không ghi dữ liệu khi thao tác bị từ chối.
- Quyết định duyệt nằm trong transaction; lỗi hiệu ứng sẽ rollback cả quyết định.
- Trạng thái `ApprovalCase` dùng đúng `AGREED`, không dùng `APPROVED`.
- Lịch sử quyết định lưu `actorPersonId`, `decidedById`, lý do, thời gian.
- `SYSTEM_ADMIN` tiếp tục không có quyền nghiệp vụ.
- Không thêm `qualityPercent`, `team`, `stage`, mô hình per-assignee.

## 4. DECISIONS_PENDING

- **E8:** trả lại Task giữ tiến độ 100% kèm nhãn hay điều chỉnh tiến độ. Bản này **giữ nguyên tiến độ/kết quả** và gắn nhãn “Bị trả lại”.
- **E9:** mô hình per-assignee, ai nộp kết quả chung, điều kiện tổng hợp. Chưa triển khai.
- **E12:** phạm vi lịch sử hợp nhất toàn bộ nguồn. Chưa triển khai; mới sửa lịch sử từng nguồn có căn cứ.

## 5. CONFLICT_EXPECTED

- `src/server/approval-case.ts` là service dùng chung với luồng Plan/Deadline. Đã kiểm tra không đổi contract bên ngoài; S0 cần review khi merge.
- `src/app/api/personal-work-items/review-queue/route.ts` gần phạm vi S1; không sửa `src/server/work-item-review.ts`.
- Không có migration/schema nên không có conflict migration.

## 6. Kết luận

```text
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: YES — sau khi S0 review diff, chạy lại regression trên DB integration
Điều kiện: không merge main/deploy; không dùng DB Production; giữ E8/E9/E12 ở trạng thái PENDING
```
