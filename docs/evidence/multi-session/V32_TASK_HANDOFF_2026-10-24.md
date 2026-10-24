# V3.2 — S4 TASK / APPROVAL / HISTORY HANDOFF

**Ngày:** 24/10/2026
**Session:** S4 V3.2 (implement quyết định đã duyệt)
**Worktree:** `D:\thanhnx\OpenCode\talung-task-approval`
**Branch:** `codex/v3.2-task`
**Base/tag:** `a721fe7` / `v3.1-production-2026-10-24`
**Code commit:** `376aa95`
**DB local:** `talung_v3_approval_impl_quality` (PostgreSQL localhost)
**Production/Vercel/Supabase touched:** **KHÔNG**

## 1. Phạm vi đã chốt

Chỉ task / approval / history. Không sửa metrics, roster; không đổi quality/precheck
semantics; flags `V3_YC10_QUALITY` và `V3_YC11_PRECHECK` giữ mặc định **OFF**;
không thêm role/quyền.

### E8-A — Trả lại giữ nguyên tiến độ + bắt buộc ghi chú

- Mọi đường trả lại Task/kết quả đều bắt buộc lý do/ghi chú, không tự sinh câu thay người quyết định:
  - `POST /api/approvals/TASK_RESULT/[id]/decision` (`REJECT`/`CLARIFY`).
  - `PATCH /api/tasks/[id]` với `status=IN_PROGRESS` khi Task đang `WAITING_REVIEW`.
  - `PATCH /api/tasks` (`REJECT_COMPLETION` hoặc status trả lại).
  - `POST /api/tasks/[id]/updates` (và alias `/progress`) khi trả `WAITING_REVIEW → IN_PROGRESS`.
- Đường `updates` trước đây ghi tắt `kind="progress"` và có thể ghi đè tiến độ client gửi (0%);
  nay đi qua `decideApproval` → có `ApprovalCase` + `ApprovalDecision` + `TaskUpdate kind="return"`.
- Tiến độ được lấy từ **TaskUpdate cấp nhiệm vụ gần nhất**, bỏ qua bản ghi phần việc phối hợp
  (`subject_person_id`/`participant_event_id`, luôn ghi 0%). Vì vậy 100% không bị “trôi” khi
  collaborator cập nhật phần việc chen giữa.
- Audit `APPROVAL_*` bổ sung `progressPercent` và `progressPolicy=PRESERVED_ON_RETURN`
  (chỉ với REJECT/CLARIFY) — không còn reset ngầm.
- UI: badge “Bị trả lại” kèm “Giữ nguyên tiến độ” (`/tasks/[id]`, `/my-work`); form trả lại
  trong preview duyệt ghi rõ tiến độ/kết quả được giữ nguyên.

### E12-A — Lịch sử hợp nhất

Nguồn **duy nhất** của lịch sử hợp nhất:

| Source | Nhãn | Nguồn dữ liệu |
|---|---|---|
| `TASK_UPDATE` | Cập nhật nhiệm vụ | `task_updates` cấp nhiệm vụ (không lấy mirror phần việc) |
| `APPROVAL_DECISION` | Quyết định duyệt | `approval_decisions` của `ApprovalCase` TASK_RESULT |
| `PARTICIPANT_EVENT` | Phần việc phối hợp | `task_participant_events` |

- **Không** gộp `TaskComment`, `TaskAttachment` (đã kiểm chứng bằng test tạo bình luận).
- API mới: `GET /api/tasks/[id]/history`
  - giữ nguyên `verifyTaskAccess(..., "READ")`;
  - filter `source` (một/nhiều, cách nhau dấu phẩy) + `limit` 1..500;
  - trả `entries` (mỗi entry có `source`, `sourceLabel`), `counts`, `sources`, `limit`.
- `GET /api/tasks/[id]` giữ nguyên contract cũ; UI task detail thêm tab
  “Nhật ký tác nghiệp” / “Lịch sử hợp nhất” + chip lọc nguồn.
- `/approvals`: khối “Đã xử lý” giữ filter cán bộ/tháng/năm và hiện nhãn nguồn; thêm danh sách
  các vòng đã quyết định. Preview duyệt hiển thị lịch sử hợp nhất cho TASK_RESULT.
- API `scope=decided`, `latestDecision` và preview history bổ sung `source`/`sourceLabel`;
  `latestDecision` + `history` không thay đổi filter/quyền hiện có.

## 2. Files changed

```text
src/server/approval-case.ts
src/server/task-history.ts                                     (mới)
src/app/api/tasks/[id]/route.ts
src/app/api/tasks/[id]/updates/route.ts
src/app/api/tasks/[id]/history/route.ts                        (mới)
src/app/api/tasks/route.ts
src/app/tasks/[id]/page.tsx
src/app/my-work/page.tsx
src/app/approvals/page.tsx
src/app/approvals/ApprovalPreviewModal.tsx
scripts/test-v3-e8-return-progress.ts                          (mới)
scripts/test-v3-e12-unified-history.ts                         (mới)
```

**Schema/migration:** KHÔNG đổi. Không cần migration mới sau `20261023190000`.
Các bảng/cột dùng cho E12 (`task_participant_events`, `approval_decisions`) đã có từ migration
Phase 1/2/3.

## 3. Test evidence

Server được chạy bằng code nhánh này, cùng DB local `talung_v3_approval_impl_quality`.
Lưu ý môi trường: **port 3117 đang bị process Next.js của worktree `talung-approval-impl`
chiếm dụng**, nên test chạy trên **port 3118** (cùng DB). Không kill process của session khác.

### Bắt buộc

| Bộ test | Kết quả |
|---|---|
| `scripts/test-v3-task-approval-hardening.ts` | **40/40 PASS** |
| `scripts/test-v3-no-self-approval.ts` | **5/5 PASS** |
| `scripts/test-v3-review-flow.ts` | **38/38 PASS** |
| `scripts/test-yc37-approval-flow.ts` | **25/25 PASS** |
| `scripts/test-yc38-submit-approval.ts` | **36/36 PASS** |
| `scripts/test-yc38-locked-task.ts` | **15/15 PASS** |
| `scripts/test-v3-e2e-flow.ts` | **40/40 PASS** |
| `scripts/test-task-transitions.ts` | **10/10 PASS** |
| `scripts/test-v3-e8-return-progress.ts` | **13/13 PASS** |
| `scripts/test-v3-e12-unified-history.ts` | **24/24 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npx prisma validate` | **PASS** |
| `pnpm build` | **PASS** (99 trang) |

### Hồi quy bổ sung (không bắt buộc, đã chạy)

| Bộ test | Kết quả |
|---|---|
| `scripts/test-v3-yc09-per-person.ts` | **42/42 PASS** |
| `scripts/test-v3-yc10-quality.ts` (flag ON) | **120/120 PASS** |
| `scripts/test-v3-yc11-precheck.ts` (flag ON) | **80/80 PASS** |

### Điểm mới của test E8

- REJECT thiếu lý do → 400; có lý do → 200.
- TaskUpdate `kind=return` giữ `progressPercent=100` dù có bản ghi phần việc 0% chen giữa.
- Audit có `progressPercent=100`, `progressPolicy=PRESERVED_ON_RETURN`.
- PATCH / updates / quick approve đều bắt buộc ghi chú; updates đi qua `ApprovalCase`.

### Điểm mới của test E12

- Đủ 3 nguồn, mọi entry có `sourceLabel`, không có nguồn lạ.
- Quyết định duyệt có lý do/nhãn hành động; participant event có người + nội dung.
- Bình luận tạo ra **không** xuất hiện trong lịch sử hợp nhất.
- Filter `source`, `limit`; source lạ → 400.
- Người ngoài đơn vị → 403 (giữ nguyên quyền READ).
- `scope=decided` giữ filter cán bộ/năm; `latestDecision` + `history` có nhãn nguồn;
  preview history có nhãn nguồn.

### Lệnh chạy tham chiếu

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/talung_v3_approval_impl_quality'
$env:DIRECT_URL=$env:DATABASE_URL
$env:TEST_BASE_URL='http://localhost:3118'
$env:TEST_PASSWORD='LocalTest@2026'
npx tsx scripts/test-v3-e8-return-progress.ts
npx tsx scripts/test-v3-e12-unified-history.ts
```

(YC38 đọc `demo-secrets.json`; DB local dùng mật khẩu fixture `LocalTest@2026` nên cần đặt
`TEST_PASSWORD` như trên.)

## 4. SECURITY_CHECKS

- Không nới quyền: history dùng đúng `verifyTaskAccess(..., "READ")`; test người ngoài đơn vị 403.
- Không bypass chống tự duyệt: trả lại qua `decideApproval` vẫn chịu `canDecide` + self-block.
- `SYSTEM_ADMIN` vẫn không có quyền nghiệp vụ.
- Không trả URL public của kho lưu trữ; không gộp bình luận/tệp đính kèm vào history.
- Không thêm role/permission; không đổi quality/precheck semantics; flags mặc định OFF.
- Không ghi Production/Vercel/Supabase; không reset/seed Production.
- Migration: không có.

## 5. Follow-up / UAT cần làm

1. **UI UAT**: chụp màn hình `/tasks/[id]` (tab Lịch sử hợp nhất), `/approvals`
   (khối Đã xử lý + preview), `/my-work` (badge giữ tiến độ). Build đã PASS nhưng chưa chụp UAT.
2. **Port 3117**: đang bị worktree `talung-approval-impl` chiếm; khi S0 rerun cần giải phóng
   hoặc dùng cổng khác và ghi rõ trong evidence.
3. **Legacy participant rows**: lịch sử hợp nhất lấy `TaskParticipantEvent` làm nguồn phần việc;
   bản ghi mirror cũ không có event tương ứng sẽ không xuất hiện trong tab hợp nhất
   (vẫn còn trong “Nhật ký tác nghiệp”). Không backfill vì ngoài phạm vi và có thể gây trùng.
4. E12 cho PLAN/DEADLINE_REQUEST vẫn chỉ là lịch sử quyết định (không có TaskUpdate/participant);
   đúng phạm vi 3 nguồn đã chốt cho Task/result.

## 6. Trạng thái merge

- Branch `codex/v3.2-task` sạch sau commit code + handoff.
- **Chưa merge** vào integration/main; **chưa deploy**. Chờ S0 kiểm tra và quyết định.
