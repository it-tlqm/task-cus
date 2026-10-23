# S6 — RÀ SOÁT S4 CHO PHASE 1 (YC-09 PER-PERSON)

**Ngày:** 23/10/2026  
**Loại:** Docs-only review — không sửa code/schema/migration  
**Baseline đọc:** integration `70ea5d7` (S4 merge `5d5c299`; S4 code `e198187`)  
**Nhánh spec:** `codex/v3-approval-rules-spec`  
**Kết luận:** **READY_FOR_PHASE1_BRANCH** — Phase 1 có thể mở nhánh sau khi S0 xác nhận baseline; các điểm S4 đã làm được tái sử dụng, các điểm còn lại được liệt kê dưới đây.

---

## 1. S4 đã thay đổi gì (đọc thực tế)

| File | Thay đổi chính | Ảnh hưởng Phase 1 |
|---|---|---|
| `src/server/approval-case.ts` | Approval summary; preview chặn self; `decideApproval` transaction ghi case/decision/TaskUpdate/notification; `reopen` ghi actorPersonId | **Tái sử dụng**, chỉ mở rộng participant/snapshot; không viết lại |
| `src/server/task-transitions.ts` | Whitelist status; `isOwner`; chặn collaborator nộp thay; chặn CANCELED tự do; chỉ leader nghiệm thu/trả | **Giữ nguyên**; Phase 1 thêm kiểm tra participant nếu cần |
| `src/app/api/tasks/[id]/route.ts` | Completion/return qua ApprovalCase; chặn collaborator sửa result/assignee/content; khóa WAITING_REVIEW | **Giữ**, bổ sung participant/progress |
| `src/app/api/tasks/[id]/updates/route.ts` | Chặn collaborator submit/actualResult; owner-only `WAITING_REVIEW`; completion qua case | **Sửa tiếp**: collaborator progress phải đi participant result |
| `src/app/api/tasks/route.ts` | Legacy action `SUBMIT/CONFIRM/REJECT` qua case; guard quyền; approval summary | **Giữ**, bổ sung participant |
| `src/app/api/tasks/[id]/deadline-request/[reqId]/review/route.ts` | Quick approve qua `decideApproval` | Không thuộc Phase 1 |
| `src/app/api/approvals/cases/route.ts` | “Đã xử lý” + filter | Không thuộc Phase 1 |
| `src/app/api/personal-work-items/review-queue/route.ts` | YC-12 history | **Không sửa** (S1/S4 boundary) |
| `src/app/approvals/page.tsx` | “Đã xử lý”, history | Phase 1 thêm participant summary; Phase 2 quality |
| `src/app/tasks/[id]/page.tsx` | Badge/summary; ẩn nút duyệt với owner; timeline approve/return | Phase 1 thêm participant panel |
| `src/app/my-work/page.tsx` | Badge/action; ẩn thu hồi sai quyền | Phase 1 sửa drawer collaborator |
| `src/app/work-item-reviews/page.tsx` | YC-12 badge/action/history | **Không sửa** (S4/YC-12) |
| `scripts/test-v3-task-approval-hardening.ts` | 40 test A–G | **Tái sử dụng** làm regression baseline |

**Schema/migration:** S4 **không** thay đổi `prisma/schema.prisma`, không tạo migration.

---

## 2. Những gì Phase 1 được tái sử dụng

1. **Một ApprovalCase/Task:** `decideApproval` dùng `approvalCase.upsert` theo unique
   `(caseType, resourceId)` (`approval-case.ts:702-719`). Phase 1 **không** tạo case thứ hai.
2. **Quyết định cuối trong transaction:** case + decision + Task status + `TaskUpdate`
   `kind=approve/return` + notification (`approval-case.ts:694-981`). Phase 1 chỉ thêm cập nhật
   participant trong cùng transaction.
3. **Projection YC-08:** `getTaskApprovalSummaries` (`approval-case.ts:98-132`) và API Task trả
   `approval`; UI đã có badge/summary.
4. **Guard S4:** status whitelist, owner-only submit, collaborator không ghi result/assignee/cancel,
   `WAITING_REVIEW` khóa nội dung (`task-transitions.ts:66-188`; Task routes).
5. **Test S4:** `test-v3-task-approval-hardening.ts` 40/40; `test-v3-no-self-approval.ts` 5/5;
   `test-yc37-approval-flow.ts` 25/25; regression Task/approval khác.

---

## 3. Khoảng trống còn lại cho Phase 1 (phải làm)

### 3.1. Collaborator vẫn ghi được tiến độ Task-level

- `POST /api/tasks/[id]/updates` cho collaborator gửi `progressPercent`, `notes`, `hasIssue`,
  `issueNotes`; route chỉ chặn submit/actualResult (`updates/route.ts:124-168, 219-248`).
- `Task.progressPercent` hiển thị lấy từ `TaskUpdate` mới nhất, không phân biệt owner/collaborator
  (`api/tasks/route.ts:203-227`; `api/tasks/[id]/route.ts:83-85`).
- **Phase 1:** collaborator gửi tiến độ vào `TaskParticipantResult`; không ghi đè tiến độ chung.
  Task progress chỉ lấy từ owner/leader (hoặc quy tắc đã chốt), không lấy trung bình participant.
- Test bắt buộc: collaborator `progressPercent=100` không làm Task hiển thị 100%; owner vẫn là
  nguồn tiến độ chung.

### 3.2. Collaborator vẫn đổi được trạng thái `IN_PROGRESS`/issue fields

- `updates` route và `tasks/[id]` route cho collaborator set `IN_PROGRESS` (guard cho phép
  `NOT_STARTED/IN_PROGRESS → IN_PROGRESS`) và `hasIssue/issueNotes`.
- **Phase 1:** chặn thay đổi **Task-level** status/issue bởi collaborator; collaborator ghi vướng
  mắc vào `partResultText`/event note của phần mình. `ACCEPT_TASK` của collaborator chỉ đổi
  participant `IN_PROGRESS`, không đổi Task status chung. Không mở quyền mới.
- Test: collaborator set `IN_PROGRESS`/`hasIssue` → 403; Task không đổi; participant note vẫn ghi
  được qua API phần việc.

### 3.3. UI collaborator vẫn thấy nút nộp chung/hoàn thành

- `my-work` drawer luôn có “Báo hoàn thành & Trình duyệt” và lựa chọn `COMPLETED`
  (`my-work/page.tsx:447-463, 1940-1975, 2206-2213`).
- `tasks/[id]` luôn có “Báo cáo tiến độ / Nộp kết quả” cho người không hoàn thành
  (`tasks/[id]/page.tsx:805-812`), dù server chặn collaborator.
- **Phase 1:** ẩn/đổi nhãn theo vai trò; collaborator chỉ thấy “Báo phần việc của tôi”;
  owner thấy “Nộp kết quả chung”; leader thấy duyệt/trả. Không để UI mời thao tác sẽ 403.

### 3.4. `ApprovalCase.submittedById` vẫn là owner, không phải người nộp thật

- Preview gán `submitterId = task.ownerId` (`approval-case.ts:256`).
- `decideApproval` gán `submitterId = task.ownerId` và upsert `submittedById` mỗi lần quyết định
  (`approval-case.ts:588, 702-719`).
- **Phase 1:** khi owner nộp chung, ghi `submittedById = owner` (đúng); không ghi đè bằng owner
  nếu tương lai có ủy quyền; self-approval phải so người nộp thật.
- Không thêm cột; dùng field hiện có.

### 3.5. `reopenApprovalCaseOnResubmit` chưa tự kiểm tra quyền

- Hàm nhận `actorAccountId`, ghi `RESPOND`, mở round (`approval-case.ts:1269-1316`) nhưng không
  kiểm tra actor có phải owner/submitter.
- Call site hiện đã owner-only qua route guard, nhưng Phase 1 nên thêm kiểm tra defense-in-depth
  hoặc ghi rõ call-site contract.

### 3.6. Chưa có participant result/event/snapshot

- Schema hiện chỉ có `TaskAssignee` + `TaskUpdate`; chưa có `TaskParticipantResult`.
- **Phase 1 migration** (xem `S6_MIGRATION_PROPOSAL_3_PHASES`):
  `task_participant_results`, `task_participant_events`, cột `task_updates`,
  `task_submission_snapshots`.
- Không sửa `TaskUpdate` cũ; timeline Task đọc thêm event.

### 3.7. Final decision chưa cập nhật participant status

- `decideApproval` hiện chỉ đổi Task status + ghi TaskUpdate (`approval-case.ts:761-819`).
- **Phase 1:** trong cùng transaction:
  - `AGREE` → participant bắt buộc `ACCEPTED`, Task `COMPLETED`.
  - `REJECT/CLARIFY` → Task `IN_PROGRESS`; phần được chọn `RETURNED`; phần `ACCEPTED` giữ.
- Không tạo `ApprovalDecision` riêng cho participant.

### 3.8. Preview chưa hiển thị participant summary

- Preview có `content.assignees` và `recentUpdates` (`approval-case.ts:274-303`) nhưng chưa có
  trạng thái/kết quả phần việc.
- **Phase 1:** thêm `content.participants[]`/`participantSummary` đọc từ bảng mới; UI modal
  hiển thị trước khi quyết định.

### 3.9. ApprovalCase được tạo ở lần quyết định đầu, không phải lúc nộp

- S4: `decideApproval` dùng `approvalCase.upsert` (`approval-case.ts:702-719`); không có hàm tạo
  case lúc submit. `reopenApprovalCaseOnResubmit` chỉ mở lại case đã có (`:1269-1316`).
- **Hệ quả:** không thể gắn snapshot trực tiếp vào `case_id` tại thời điểm nộp; nếu tạo case sớm
  sẽ phát sinh case OPEN treo khi Task bị hủy trước quyết định.
- **Phase 1:** giữ hành vi S4 (case tạo ở lần quyết định đầu) và dùng
  `task_submission_snapshots` keyed `(task_id, round)`:
  - lưu snapshot + `submitted_by_id` thật khi owner nộp;
  - khi `decideApproval` upsert case, lấy `submitted_by_id` từ snapshot mới nhất thay vì
    `task.ownerId`;
  - không tạo case thứ hai; không có case treo.
- Đây là **điều chỉnh kỹ thuật** so với câu chữ “case lưu snapshot”; không thay đổi quyết định
  nghiệp vụ (một case/Task, snapshot tại thời điểm nộp).

---

## 4. Xác nhận “một ApprovalCase/Task”

- Schema: `ApprovalCase` unique `(caseType, resourceId)` (`schema.prisma:1847`).
- S4: `decideApproval` dùng `upsert` theo unique đó (`approval-case.ts:702-719`), không tạo case
  thứ hai.
- Phase 1 **giữ nguyên**:
  - `TASK_RESULT` + `Task.id` → đúng một case.
  - Participant result/event là dữ liệu con, không phải case.
  - Pre-check (Phase 3) là event, không phải case.
  - Không tạo `PERSONAL_EVALUATION`/case mới cho từng người.
- `task_submission_snapshots` (Phase 1) là snapshot theo `(task_id, round)`, không thay case;
  case được tạo ở lần quyết định đầu.

---

## 5. File ownership sau S4

| Nhóm file | Owner hiện tại | Phase 1 |
|---|---|---|
| `src/server/approval-case.ts` | S4 đã merge | Phase 1 được sửa tiếp; S4 chỉ tư vấn |
| `src/server/task-transitions.ts` | S4 đã merge | Hạn chế sửa; nếu cần, review S0 |
| `src/app/api/tasks/**` | S4 đã merge | Phase 1 sở hữu tiếp |
| `src/app/tasks/[id]/page.tsx` | S4 đã merge | Phase 1 sửa participant UI |
| `src/app/my-work/page.tsx` | S4 đã merge | Phase 1 sửa drawer |
| `src/app/approvals/**` | S4 đã merge | Phase 1 thêm participant; Phase 2 quality |
| `src/app/work-item-reviews/**` | S4/YC-12 | **Không sửa** |
| `src/app/api/personal-work-items/**` | S1/S4 | **Không sửa** |
| `src/app/api/plans/**`, Phase A | S1 | **Không sửa** |
| `src/server/metrics.ts`, `/giao-ban` | S2/S3 | **Không sửa** |
| `/roster` | S5 | **Không sửa** |
| `prisma/schema.prisma` + migration | Phase 1 thêm additive | Chỉ migration mới, không sửa migration cũ |

**Quy tắc:** sau merge S4, Phase 1 là owner của Task/approval; S4 không sửa song song. Mọi thay
đổi `approval-case.ts`/Task routes phải có review S0.

---

## 6. Conflict dự kiến & cách xử lý

| File | S4 đã đổi | Phase 1 thay đổi | Rủi ro | Cách xử lý |
|---|---|---|---|---|
| `approval-case.ts` | 630 dòng; transaction, preview, summary | Thêm participant/snapshot/quality hook | Cao — dễ revert S4 | Patch trên HEAD 70ea5d7; test S4 40/40 trước/sau |
| `task-transitions.ts` | 95 dòng; whitelist/owner | Có thể chỉ dùng, không sửa | Trung bình | Giữ nguyên; nếu sửa, test lại 10/10 |
| `api/tasks/[id]/route.ts` | 92 dòng; completion qua case | Thêm participant/progress | Cao | Sửa cục bộ; giữ các guard S4 |
| `api/tasks/[id]/updates/route.ts` | 58 dòng; chặn submit/result | Chuyển collaborator progress sang participant | Cao | Viết test trước; không bỏ guard S4 |
| `api/tasks/route.ts` | 162 dòng; legacy actions | Thêm participant submit | Trung bình | Giữ action contract; test legacy |
| `tasks/[id]/page.tsx` | 69 dòng; badge/summary | Participant panel/nút | Trung bình | Component mới; không phá summary |
| `my-work/page.tsx` | 64 dòng; badge/action | Drawer collaborator | Trung bình | Sửa theo `isOwner`/assignee |
| `approvals/page.tsx` | 169 dòng; history | Participant summary | Trung bình | Chỉ thêm block; không đổi filter |
| `prisma/schema.prisma` | Không đổi | Bảng/cột Phase 1 | Thấp | Additive; migration riêng |

---

## 7. Thứ tự migration Phase 1

- Migration gần nhất trong integration: `prisma/migrations/20261023120000_v3_phase_a_planning`.
- Phase 1 tạo migration **mới**, timestamp lớn hơn, ví dụ:
  `20261023140000_v3_task_participant_results` (tên cuối do implementation owner chốt).
- **Không sửa** migration `20261023120000_v3_phase_a_planning` (S1 đã rehearsal).
- Thứ tự trong migration Phase 1:
  1. `task_participant_results`
  2. `task_participant_events`
  3. `task_updates` + `subject_person_id`, `participant_event_id`
  4. `task_submission_snapshots`
- Không có migration S4; không cần backfill.
- Rehearsal trên fixture; kiểm tra `_prisma_migrations` trước khi apply.

---

## 8. Test gate trước khi mở Phase 1 branch

### 8.1. Baseline bắt buộc trên integration 70ea5d7

- `npx tsc --noEmit`
- `npx prisma validate`
- `pnpm build`
- `scripts/test-v3-task-approval-hardening.ts` — 40/40
- `scripts/test-v3-no-self-approval.ts` — 5/5
- `scripts/test-yc37-approval-flow.ts` — 25/25
- `scripts/test-v3-review-flow.ts` — 38/38
- `scripts/test-yc38-submit-approval.ts` — 36/36
- `scripts/test-yc38-locked-task.ts` — 15/15
- `scripts/test-v3-e2e-flow.ts` — 40/40

### 8.2. Phase 1 gate (bổ sung)

- `scripts/test-v3-yc09-per-person.ts` (mới): participant submit/return/accept/exempt; S-ALL;
  E9.3; legacy; one case; no monthly duplicate; QĐ1277 unchanged.
- `scripts/test-v3-task-approval-hardening.ts` phải vẫn 40/40 (không regression S4).
- `test-v3-no-self-approval` 5/5; collaborator không nộp thay/ghi đè.
- Migration apply/rollback Phase 1 trên fixture.
- UI Desktop/Mobile: participant panel, drawer collaborator, approval preview.
- Không đổi score/monthly/QĐ1277; test parity.

### 8.3. Điều kiện Go

- [ ] S0 xác nhận baseline 70ea5d7 + S4 tests PASS.
- [ ] Phase 1 migration rehearsal PASS.
- [ ] Không còn collaborator ghi task-level progress/shared result.
- [ ] Một ApprovalCase/Task được chứng minh bằng test.
- [ ] Legacy Task/PersonalWorkItem PASS.
- [ ] Không sửa file ngoài ownership.

---

## 9. Kết luận

S4 đã xử lý đúng phần lớn hotfix YC-09 và projection YC-08; Phase 1 **không viết lại** mà **mở rộng**
trên nền S4. Các việc còn lại tập trung vào:
1. participant result/event + một case;
2. chuyển collaborator progress khỏi Task-level;
3. UI vai trò;
4. `submittedById`/reopen;
5. final decision cập nhật participant.

**Trạng thái:** `READY_FOR_PHASE1_BRANCH` — S0 có thể tạo worktree/branch implementation sau khi
xác nhận baseline 70ea5d7 và test gate.
