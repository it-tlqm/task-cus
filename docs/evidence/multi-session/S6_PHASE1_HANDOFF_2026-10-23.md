# S6-IMPL — HANDOFF PHASE 1 (YC-09 PER-PERSON)

**Ngày:** 23/10/2026  
**Session:** S6-Impl — Phase 1  
**Worktree:** `D:\thanhnx\OpenCode\talung-approval-impl`  
**Branch:** `codex/v3-approval-phase1`  
**DB test:** `talung_v3_approval_impl` (localhost) — port `3116`  
**Production touched:** **NO**

> **S0 review 23/10/2026:** đã merge `722d892` vào integration `e80a24f`. S0 rerun 42/42 per-person + 40/40 hardening + 5/5 no-self + 38/38 review + 25/25 YC37 + 36/36 YC38 submit + 15/15 locked + 40/40 e2e + 10/10 transitions + 5/5 UI; build PASS. Migration đã đổi timestamp sang `20261023170000` để tránh trùng S2 và áp lên `talung_v3_fixture_integration`. Phase 2/3 vẫn PENDING.

```text
SESSION: S6-Impl — Phase 1 (YC-09 per-person)
YC: YC-09
BRANCH: codex/v3-approval-phase1
BASE_SHA: 54d8c8c (docs); code baseline 70ea5d7 (S4 đã merge)
COMMIT_SHA: efab0b0 (feat Phase 1; docs handoff cập nhật ở commit kế tiếp)
FILES_CHANGED:
  - prisma/schema.prisma
  - prisma/migrations/20261023170000_v3_task_participant_results/migration.sql (mới)
  - src/server/task-participant.ts (mới)
  - src/server/approval-case.ts
  - src/app/api/tasks/[id]/participant-results/route.ts (mới)
  - src/app/api/tasks/[id]/participant-results/[personId]/decision/route.ts (mới)
  - src/app/api/tasks/[id]/submit-overall/route.ts (mới)
  - src/app/api/tasks/[id]/updates/route.ts
  - src/app/api/tasks/[id]/route.ts
  - src/app/api/tasks/route.ts
  - src/app/api/approvals/[caseType]/[id]/decision/route.ts
  - src/app/tasks/[id]/page.tsx
  - src/app/my-work/page.tsx
  - src/app/approvals/ApprovalPreviewModal.tsx
  - scripts/test-v3-yc09-per-person.ts (mới)
  - scripts/test-yc09-phase1-ui.ts (mới)
  - scripts/test-yc38-submit-approval.ts (fixture compatibility)
  - scripts/test-yc38-locked-task.ts (participant S-ALL fixture)
  - scripts/lib/test-db-safety.ts (allow approval_impl)
  - docs/evidence/phase1/*.png (UI evidence)
SCHEMA_OR_MIGRATION: CÓ — 1 migration additive Phase 1; đã apply local bằng `prisma db execute` (DB gốc clone bằng db push, chưa có _prisma_migrations)
TESTS_PASS:
  - tsc --noEmit PASS
  - prisma validate PASS
  - pnpm build PASS
  - test-v3-yc09-per-person: 42/42
  - test-v3-task-approval-hardening: 40/40
  - test-v3-no-self-approval: 5/5
  - test-yc37-approval-flow: 25/25
  - test-v3-review-flow: 38/38
  - test-yc38-submit-approval: 36/36
  - test-yc38-locked-task: 15/15
  - test-v3-e2e-flow: 40/40
  - test-task-transitions: 10/10
  - test-yc09-phase1-ui: 5/5 (Desktop + Mobile)
TESTS_NOT_RUN:
  - Toàn bộ 471 test lịch sử (không có trong baseline)
  - UAT người dùng thật (chỉ fixture/role giả lập)
UI_EVIDENCE:
  - docs/evidence/phase1/01-collaborator-task-desktop.png
  - docs/evidence/phase1/02-collaborator-task-mobile.png
SECURITY_CHECKS:
  - Collaborator không nộp thay/ghi đè result/assignee/cancel/status/issue
  - Không tự duyệt; ApprovalCase.submittedBy là người nộp thật từ snapshot
  - reopen chỉ owner/submitter; SYSTEM_ADMIN không nghiệp vụ
  - Một ApprovalCase/Task; không tạo case participant
  - Không chạm QĐ1277/monthly/scoring/quality/team/stage
DECISIONS_PENDING: NONE
CONFLICT_EXPECTED:
  - src/server/approval-case.ts, Task routes/UI: đã patch trên S4, S0 review diff
  - Migration Phase 1 là migration mới sau 20261023120000; không sửa migration cũ
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: YES — chờ S0 review/merge theo gate
```

## 1. Phạm vi đã triển khai

### 1.1. Dữ liệu

- `TaskParticipantResult`: trạng thái/kết quả phần việc từng người.
- `TaskParticipantEvent`: append-only cho SUBMIT/PROGRESS/RETURN/ACCEPT/EXEMPT (và chỗ cho
  PRECHECK phase sau).
- `TaskSubmissionSnapshot`: snapshot theo `(task_id, round)`, lưu `submitted_by_id` thật.
- `TaskUpdate`: thêm `subject_person_id`, `participant_event_id` (nullable, additive).
- Migration: `20261023170000_v3_task_participant_results`.
- **Không** đổi `ApprovalCase` unique; **không** thêm role/quyền; **không** chạm
  QĐ1277/monthly/scoring.

### 1.2. Hành vi

- Collaborator cập nhật tiến độ qua `participant-results`; Task progress không bị đẩy lên.
- Collaborator báo phần việc; không nộp chung/ghi đè kết quả/assignee/cancel/status.
- Owner nộp chung qua S-ALL + snapshot; `ApprovalCase` chỉ tạo ở lần quyết định đầu (S4),
  snapshot vẫn có trước case.
- `submittedById` lấy từ snapshot; reopen chỉ owner/submitter.
- Final AGREE → participant ACCEPTED; REJECT/CLARIFY → chọn phần RETURNED, giữ ACCEPTED.
- Preview/Approvals hiển thị participant summary; UI collaborator không còn nút nộp chung.
- Legacy Task: không có participant row được coi là legacy, không chặn S-ALL cho tới khi
  collaborator thao tác; Task mới qua API được khởi tạo participant row (`legacy=false`) nên
  S-ALL áp dụng ngay.

## 2. Điểm cần S0 review kỹ

1. **Legacy compatibility:** migration không backfill; `legacy` flag bảo vệ Task cũ. Task mới qua
   API khởi tạo rows; Task import/seed cũ giữ legacy.
2. **S-ALL + Task cũ:** Task đang `WAITING_REVIEW` trước deploy vẫn final-only; không bắt
   participant.
3. **Test fixture adjustments:** `test-yc38-submit-approval` thêm fallback account khi thiếu
   person code DEMO; `test-yc38-locked-task` cho collaborator báo phần trước khi owner nộp.
4. **Migration history:** DB test chưa có `_prisma_migrations`; migration file đã tạo và apply
   local bằng `db execute`. Khi release cần rehearsal theo quy trình S1/S0.
5. **UI:** collaborator thấy “Báo phần việc của tôi”; owner thấy “Nộp kết quả chung”; leader có
   nút chấp nhận/trả phần việc trên panel.

## 3. Lệnh chạy test

```powershell
npx tsc --noEmit
npx prisma validate
pnpm build

$env:TEST_BASE_URL="http://localhost:3116"
$env:TEST_PASSWORD="LocalTest@2026"
npx tsx scripts/test-v3-yc09-per-person.ts
npx tsx scripts/test-v3-task-approval-hardening.ts
npx tsx scripts/test-v3-no-self-approval.ts
npx tsx scripts/test-yc37-approval-flow.ts
npx tsx scripts/test-v3-review-flow.ts
npx tsx scripts/test-yc38-submit-approval.ts
npx tsx scripts/test-yc38-locked-task.ts
npx tsx scripts/test-v3-e2e-flow.ts
npx tsx scripts/test-task-transitions.ts
npx tsx scripts/test-yc09-phase1-ui.ts
```

**Không merge `main`, không deploy, không ghi Production.**
