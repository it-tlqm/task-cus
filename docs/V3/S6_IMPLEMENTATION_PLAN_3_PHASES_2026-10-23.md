# S6 — IMPLEMENTATION PLAN 3 PHASE (YC-09 → YC-10 → YC-11)

**Ngày:** 23/10/2026  
**Trạng thái:** **APPROVED PLAN** — căn cứ `S0_DECISION_LOG_2026-10-23.md`  
**Nhánh spec:** `codex/v3-approval-rules-spec` — **không code/schema/migration**  
**Nhánh implementation:** do S0 mở sau khi S4 merge (tên tạm: `codex/v3-impl-yc09-11`)  
**Tài liệu liên quan:**
- `docs/V3/S6_SPEC_YC09_YC10_YC11_2026-10-23.md`
- `docs/V3/S6_MIGRATION_PROPOSAL_3_PHASES_2026-10-23.md`
- `docs/V3/S6_TEST_PLAN_3_PHASES_2026-10-23.md`

---

## 1. Mục tiêu, phạm vi, điều kiện tiên quyết

### 1.1. Mục tiêu

Triển khai tuần tự ba năng lực đã được chủ dự án phê duyệt:

1. **Phase 1 — YC-09:** kết quả phần việc theo từng người trên Task, một ApprovalCase chung.
2. **Phase 2 — YC-10:** mức chất lượng 65–100 gắn với lượt quyết định duyệt; chỉ hiển thị/audit.
3. **Phase 3 — YC-11:** kiểm tra sơ bộ theo tuyến `PersonSupervision` → quyết định cuối bằng
   ApprovalCase hiện có.

### 1.2. Trong phạm vi

- Task result (`TASK_RESULT`) và các thành phần liên quan trực tiếp: participant result/event,
  ApprovalCase/Decision, route snapshot, audit, notification, UI Task/Approvals.
- Migration additive cho 3 phase.
- Test/security/regression/UAT theo test plan.

### 1.3. Ngoài phạm vi

- Không mở per-person cho PersonalWorkItem độc lập (E9.1).
- Không tạo `TEAM_LEADER`/`DEPUTY_LEADER`, không seed `person_supervisions`, không tạo OrgUnit
  cấp 3.
- Không đưa quality vào Bảng 1, `qualityRatio c`, `taskResultScore`, `finalGrade`, QĐ1277,
  `MonthlyWorkResult` hoặc điểm chính thức (E10.5).
- Không đổi luồng `PLAN`, `DEADLINE_REQUEST`, `PERSONAL_EVALUATION`.
- Không thêm `tasks.precheck` hoặc `approvals.quality.adjust` (P-2/P-3).
- Không merge `main`, không deploy, không ghi Production.

### 1.4. Điều kiện tiên quyết

| # | Điều kiện | Xác minh |
|---|---|---|
| 1 | S4 đã merge hotfix YC-08/09/12 vào integration | S0 xác nhận SHA + diff + test |
| 2 | Baseline implementation không còn conflict ở `approval-case.ts`, Task routes | `git diff`, review S0/S4 |
| 3 | `prisma validate`/`tsc`/`build` trên baseline PASS | log S0 |
| 4 | Fixture DB riêng cho implementation | `.env.local`, không Production |
| 5 | `person_supervisions` được xác minh read-only trước Phase 3 | query read-only; không seed |
| 6 | Feature flag/tắt được cho từng phase | config server-side |

**Không bắt đầu Phase 1 nếu S4 chưa merge**, trừ khi S0 quyết định tách nhánh và chấp nhận
conflict rõ ràng. Không sửa approval service đang có thay đổi chưa merge.

---

## 2. Nguyên tắc kiến trúc & triển khai

1. **Một Task — một ApprovalCase.** Không tạo case thứ hai cho participant/pre-check.
2. **TaskParticipantResult là projection trạng thái hiện tại; event là append-only.** Không
   ghi đè lịch sử.
3. **Quality thuộc ApprovalDecision**, không thuộc Task/Product/Monthly.
4. **Pre-check là sự kiện**, không phải stage/case; final mới mở ApprovalCase.
5. **Quyền kiểm tra phía server**; UI chỉ hiển thị. Không tin client.
6. **Additive migration**, nullable, không default nghiệp vụ; legacy đọc được.
7. **Feature flag** cho từng phase; mặc định tắt cho tới khi gate đạt.
8. **Không thay đổi công thức điểm/QĐ1277**; mọi ảnh hưởng điểm phải có quyết định riêng.

---

## 3. Tổng quan 3 phase

| Phase | Năng lực | Schema/migration | Phụ thuộc | Gate chuyển phase |
|---|---|---|---|---|
| **1** | YC-09 per-person + hardening quyền collaborator | `task_participant_results`, `task_participant_events`, cột `task_updates`, snapshot | S4 merge | Security + legacy + S-ALL + không trùng tháng/QĐ1277 |
| **2** | YC-10 quality 65–100 trên decision | `approval_decisions.quality_percent`, `approval_quality_adjustments` | Phase 1 + S4 | Validation + bắt buộc AGREE + score/export parity |
| **3** | YC-11 pre-check/final theo supervision | `approval_route_snapshots` (và dùng event Phase 1) | Phase 1 + S4 + supervision verified | Route/self-approval/multi-department/legacy |

**Thứ tự bắt buộc:** Phase 1 → Phase 2 → Phase 3. Không chạy song song hai phase chạm cùng
`approval-case.ts`/Task routes nếu chưa có S0 điều phối.

---

## 4. Phase 1 — YC-09 per-person

### 4.1. Mục tiêu phase

- Collaborator báo kết quả phần mình; chủ trì tổng hợp và nộp chung.
- Một quyết định cuối cho Task; không tạo case/điểm tháng riêng.
- Chặn mọi đường collaborator ghi đè/nộp thay/đổi assignee/cancel.
- Legacy Task vẫn chạy.

### 4.2. Work packages

| WP | Nội dung | File/module dự kiến | Deliverable |
|---|---|---|---|
| **P1-DB** | Bảng participant result/event; cột `task_updates`; snapshot | `prisma/schema.prisma`, migration mới | Migration additive + rehearsal report |
| **P1-DOM** | Domain service trạng thái, S-ALL, E9.3, lock/unlock, permission | `src/server/task-participant.ts` (mới) | Service + unit tests |
| **P1-API** | API submit/return/accept/exempt phần việc; submit overall | `src/app/api/tasks/[id]/participant-results/**` (mới), `tasks/[id]/updates/route.ts` | API contract + tests |
| **P1-GUARD** | Hardening legacy Task routes; whitelist status; actualResultText | `src/app/api/tasks/[id]/route.ts`, `src/app/api/tasks/route.ts`, `src/server/task-transitions.ts` | 403/409/422 đúng; security tests |
| **P1-APP** | ApprovalCase snapshot, submittedBy thật, reopen guard, decision effects | `src/server/approval-case.ts` | Preview/decision tích hợp |
| **P1-UI** | Task detail participant panel; nút own part/overall submit; blocker list | `src/app/tasks/[id]/page.tsx`, component mới | UI Desktop/Mobile |
| **P1-APPROVAL-UI** | Approval preview hiển thị phần việc + trạng thái | `src/app/approvals/ApprovalPreviewModal.tsx`, `page.tsx` | UI evidence |
| **P1-AUDIT** | Audit + notification cho submit/return/accept/overall/final | `src/server/audit.ts`, `src/server/notifications.ts` | Event list + tests |
| **P1-TEST** | Test plan Phase 1 | `scripts/test-v3-yc09-per-person.ts` (mới) | Pass/fail + evidence |

### 4.3. Mô hình & trạng thái (đã chốt)

- `partStatus`: `NOT_STARTED | IN_PROGRESS | SUBMITTED | RETURNED | ACCEPTED | EXEMPT`.
- `Task.status` vẫn là trạng thái chung; chỉ owner được đưa Task sang `WAITING_REVIEW`.
- `S-ALL`: owner chỉ nộp chung khi mọi participant bắt buộc đã `SUBMITTED/ACCEPTED/EXEMPT`.
- `EXEMPT` chỉ người có thẩm quyền, có lý do + audit.
- `E9.3`: final `AGREE` → phần bắt buộc `ACCEPTED`, Task `COMPLETED`; `REJECT/CLARIFY` → Task
  `IN_PROGRESS`, phần được chọn `RETURNED`, phần đã `ACCEPTED` giữ nguyên.
- `E9.6`: không partial approval; một quyết định cuối.
- Lock: `WAITING_REVIEW`/`COMPLETED` khóa phần việc và kết quả; mở lại khi lãnh đạo trả.

### 4.4. API contract đề xuất

> Tên route có thể được implementation owner tinh chỉnh, nhưng contract/status code và quyền
> phải giữ đúng.

**A. Gửi phần việc của mình**

`POST /api/tasks/[id]/participant-results`

```json
{
  "action": "SUBMIT",
  "partResultText": "...",
  "partCompletedOn": "2026-10-23",
  "partProgressPercent": 100
}
```

- Chỉ `user.personId` là participant của Task.
- `partResultText` ≥ 5 ký tự; `partCompletedOn` hợp lệ.
- Task không terminal/locked.
- Trả 200 + participant result; 403 nếu không phải phần mình; 409 nếu khóa; 422 nếu thiếu dữ liệu.

**B. Trả lại/chấp nhận/miễn phần việc (lãnh đạo/pre-check)**

`POST /api/tasks/[id]/participant-results/[personId]/decision`

```json
{ "action": "RETURN", "note": "..." }
```

- `RETURN` bắt buộc note; `ACCEPT`/`EXEMPT` theo thẩm quyền.
- Không tự quyết định phần của chính mình.
- 403 nếu không có thẩm quyền; 409 nếu trạng thái không hợp lệ.

**C. Nộp kết quả chung**

`POST /api/tasks/[id]/submit-overall` hoặc mở rộng `POST /api/tasks/[id]/updates` với
`submitForReview: true` (implementation owner chọn; không tạo hai contract song song).

- Chỉ owner.
- `S-ALL` thỏa; nếu không, 409/422 kèm danh sách người chưa báo.
- Transaction: tạo snapshot + Task `WAITING_REVIEW` + mở/round ApprovalCase + TaskUpdate `submit`.

**D. Legacy hardening**

- `PATCH /api/tasks/[id]`: collaborator không được sửa title/description/priority/deadline/
  expectedResult/assigneeIds/owner/status; chỉ được dùng API phần việc.
- `POST /api/tasks/[id]/updates`: collaborator gửi `actualResultText` → 403/422, không success;
  collaborator không set `WAITING_REVIEW`/`COMPLETED`/`CANCELED`; progress chỉ ghi nhận phần mình.
- `POST /api/tasks`/assignee changes: giữ quyền hiện có; không mở cho collaborator.

### 4.5. Tích hợp ApprovalCase

- Preview trả `participants[]` (tên, vai trò, trạng thái, kết quả phần, ngày, note) + snapshot.
- `decideApproval`:
  - `AGREE`: Task `WAITING_REVIEW → COMPLETED`; participant bắt buộc → `ACCEPTED`; audit.
  - `REJECT/CLARIFY`: Task → `IN_PROGRESS`; participant được chọn → `RETURNED`; accepted giữ;
    audit.
- `submittedById` = người bấm nộp thật, không mặc định owner.
- `reopenApprovalCaseOnResubmit`: chỉ owner; ghi actor đúng; không cho collaborator mở vòng.
- Không tạo `ApprovalDecision` cho từng participant.

### 4.6. UI/UX

- Task detail:
  - Danh sách participant + badge trạng thái.
  - Collaborator: “Báo kết quả phần của tôi”; sửa khi `RETURNED`; không thấy nút nộp chung.
  - Owner: “Nộp kết quả chung” + danh sách người chưa báo; không nộp khi S-ALL fail.
  - Leader: trả lại/chấp nhận phần; xem tổng hợp.
- Approvals modal: phần việc từng người + trạng thái; quyết định cuối.
- Mobile: panel xếp dọc, không mất nút/không tràn.

### 4.7. Acceptance criteria Phase 1

- [ ] Collaborator không thể ghi đè `actualResultText`/assignee/owner/cancel/nộp chung.
- [ ] Collaborator gửi phần mình thành công; Task chưa `WAITING_REVIEW`.
- [ ] Owner nộp chung khi S-ALL fail → 409/422, nêu người thiếu; không đổi status.
- [ ] Owner nộp đủ → Task `WAITING_REVIEW`; case đúng; snapshot đúng.
- [ ] Final AGREE/REJECT/CLARIFY đúng E9.3; một quyết định; lịch sử đầy đủ.
- [ ] Legacy Task không có participant vẫn xem/nộp/duyệt được.
- [ ] Không sinh `MonthlyWorkResult`/`WorkItemProduct` cho collaborator.
- [ ] Audit/notification đúng; không gửi “đã duyệt” khi mới accepted part.
- [ ] Desktop/Mobile PASS; typecheck/build/regression PASS.

---

## 5. Phase 2 — YC-10 quality 65–100

### 5.1. Mục tiêu phase

- Lãnh đạo chọn mức chất lượng khi duyệt kết quả Task.
- Bắt buộc với `AGREE`/`TASK_RESULT`; không bắt buộc với `REJECT/CLARIFY`.
- Chỉ hiển thị/audit/sheet phụ; không ảnh hưởng điểm/QĐ1277/monthly.

### 5.2. Work packages

| WP | Nội dung | File/module dự kiến | Deliverable |
|---|---|---|---|
| **P2-DB** | `quality_percent` nullable; bảng adjustment | `prisma/schema.prisma`, migration | Migration + rehearsal |
| **P2-DOM** | Validate 65–100 step 5; policy M1; history; adjustment A1 | `src/server/approval-quality.ts` (mới) | Service + tests |
| **P2-API** | Preview trả quality; decision nhận quality; adjustment API | `src/app/api/approvals/**`, `src/server/approval-case.ts` | API + tests |
| **P2-UI** | Select quality trong modal; hiển thị history; adjustment | `ApprovalPreviewModal.tsx`, `tasks/[id]/page.tsx` | UI evidence |
| **P2-EXPORT** | Sheet phụ/annex quality; không đổi ô chính thức | `src/server/evaluation-export.ts`/route export | Export evidence |
| **P2-TEST** | Test plan Phase 2 | `scripts/test-v3-yc10-quality.ts` (mới) | Pass/fail |

### 5.3. Quy tắc đã chốt

- Values: `65, 70, 75, 80, 85, 90, 95, 100`; `NULL` mặc định.
- `AGREE` + `TASK_RESULT` thiếu quality → 422, **không** đổi case/Task.
- `REJECT/CLARIFY` không bắt buộc; nếu có ghi lịch sử.
- `AGREE` mức 65 vẫn là `AGREE`, Task `COMPLETED`; không tự reject/không tự đổi điểm.
- `E10.4 A1`: sau quyết định, quality bất biến; điều chỉnh qua yêu cầu riêng, lý do, old/new,
  người xử lý, audit; không update đè.
- `E10.6`: owner + tuyến duyệt + người quyết định được xem; collaborator không mặc nhiên.
- `E10.7`: không tự tổng hợp quality từng người; Q2 nếu cần phải có quyết định riêng.

### 5.4. API contract đề xuất

- `POST /api/approvals/[caseType]/[id]/decision` body thêm `qualityPercent?: number`.
  - Validate trước khi update case.
  - `AGREE` + `TASK_RESULT` + missing → 422.
  - Lưu cùng transaction với decision/status.
- Preview trả `quality` hiện tại/lịch sử.
- Adjustment:
  - `POST /api/approvals/[caseType]/[id]/quality-adjustments` (request).
  - `POST /api/approvals/quality-adjustments/[id]/decision` (approve/reject).
  - Chỉ người có thẩm quyền duyệt hồ sơ, không phải người yêu cầu, không tự duyệt.
  - Đây là cách vận hành mặc định, **không phải cấp quyền mới**; nếu S0 muốn người/cấp khác
    phải chốt bổ sung.
  - Không cấp mã quyền mới (P-3); nếu S0 muốn mã riêng phải chốt bổ sung.

### 5.5. Ảnh hưởng điểm/export

- Không sửa `src/server/scoring/**`, `MonthlyWorkResult`, `ProductItem`, `WorkItemProduct`.
- `qualityRatio c`/`score70`/`d`/`taskResultScore`/`finalGrade` giữ nguyên.
- Export: thêm sheet phụ “Đánh giá chất lượng” hoặc annex; không sửa ô 01A/01B/02A/02B.
- Nếu sau này muốn tính điểm: phải có quyết định riêng + `formulaVersion` + snapshot + parity.

### 5.6. Acceptance criteria Phase 2

- [ ] 65–100 step 5 accepted; 60/72/99/101 rejected.
- [ ] AGREE thiếu quality → 422, case/Task không đổi.
- [ ] AGREE 65 → Task COMPLETED, quality 65; không tự reject/không đổi điểm.
- [ ] REJECT/CLARIFY không bắt buộc quality.
- [ ] Quality history theo vòng; adjustment old/new/audit; không update đè.
- [ ] Owner/tuyến/decider xem được; collaborator không xem mặc định.
- [ ] Bảng 1/score/export chính thức không đổi; sheet phụ đúng.
- [ ] QĐ1277 không bị ảnh hưởng; không sinh dòng mới.

---

## 6. Phase 3 — YC-11 pre-check/final

### 6.1. Mục tiêu phase

- Trưởng/Phó bộ phận hoặc tuyến phụ trách kiểm tra sơ bộ phần việc.
- Final do người có thẩm quyền hiện tại quyết định.
- Không tạo role/stage/case mới; thiếu tuyến chờ phân tuyến.

### 6.2. Work packages

| WP | Nội dung | File/module dự kiến | Deliverable |
|---|---|---|---|
| **P3-DB** | `approval_route_snapshots`; dùng event Phase 1 | `prisma/schema.prisma`, migration | Migration + rehearsal |
| **P3-ROUTE** | Resolver theo `PersonSupervision`; cycle/max-depth; no fallback | `src/server/approval-route.ts` (mới) | Service + tests |
| **P3-PRECHECK** | Pre-check pass/return; quyền; event; notification | `src/server/task-precheck.ts` (mới), API route | API + tests |
| **P3-APP** | Final chỉ mở sau pre-check; route snapshot; legacy final-only | `src/server/approval-case.ts` | Integration |
| **P3-UI** | Hàng chờ pre-check; badge; final preview | `src/app/tasks/[id]/page.tsx`, `src/app/approvals/**` | UI evidence |
| **P3-TEST** | Test plan Phase 3 | `scripts/test-v3-yc11-precheck.ts` (mới) | Pass/fail |

### 6.3. Route resolver (thiết kế)

**Input:** Task + participants + owner unit.

**Nguồn:** `PersonSupervision` với `status = CONFIRMED`, `effectiveFrom <= now`,
`effectiveTo IS NULL OR >= now`.

**Thuật toán:**
1. Với mỗi participant (trừ VIEWER): lấy direct manager(s).
2. Loại self; phát hiện cycle; giới hạn depth (ví dụ 5) — nếu vượt/cycle → `WAITING_ASSIGNMENT`.
3. Nếu không có manager → `WAITING_ASSIGNMENT`; không fallback đơn vị.
4. Pre-checker hợp lệ: một trong các manager; không phải participant; không phải final approver
   của chính hồ sơ.
5. Final approver: người có thẩm quyền hiện tại (E11.9), không phải owner/submitter/pre-checker
   của cùng hồ sơ.
6. Nếu pre-checker trùng final → yêu cầu người khác/`WAITING_ASSIGNMENT`; không tự bỏ bước.
7. Snapshot route khi owner nộp; route thay đổi sau đó không viết lại snapshot.

**Trạng thái route:** `READY | WAITING_ASSIGNMENT | CYCLE | AMBIGUOUS`.

### 6.4. Pre-check contract

- Chỉ pre-checker được phân; task `IN_PROGRESS`; participant `SUBMITTED`.
- `PASS`: ghi event `PRECHECK_PASS`; **không** đổi participant sang `ACCEPTED` (final mới
  `ACCEPTED`); không mở ApprovalCase.
- `RETURN`: participant `RETURNED`; bắt buộc note; event `PRECHECK_RETURN`; task vẫn
  `IN_PROGRESS`; không mở case.
- Một người pre-check là đủ (E11.6); ghi rõ ai.
- Khi tất cả participant bắt buộc có `PRECHECK_PASS` (hoặc `EXEMPT`), owner mới được nộp chung.
- Legacy Task không có participant/pre-check: final-only; không bắt pre-check.

### 6.5. Multi-department (M2)

- Mỗi participant pre-check theo tuyến của người đó.
- Final theo đơn vị chủ trì (owner unit) và thẩm quyền hiện tại.
- Không đồng duyệt tất cả đơn vị; không tạo case riêng cho từng bộ phận.
- Nếu một bộ phận thiếu tuyến: phần đó `WAITING_ASSIGNMENT`; owner không nộp chung cho tới khi
  xử lý (theo S-ALL) hoặc lãnh đạo có ngoại lệ được chốt.

### 6.6. Acceptance criteria Phase 3

- [ ] Tuyến 2 bước: pre-check pass → final; Task chỉ COMPLETED sau final.
- [ ] Pre-check return: part RETURNED; Task chưa WAITING_REVIEW; note bắt buộc.
- [ ] Phó chỉ pre-check khi có supervision/ủy quyền; không mặc định final.
- [ ] Thiếu tuyến: `WAITING_ASSIGNMENT`; không ai duyệt; không fallback.
- [ ] Tự duyệt/trùng người hai bước: 403/block; yêu cầu người khác.
- [ ] Multi-department: pre-check đúng tuyến từng người; final đúng đơn vị chủ trì.
- [ ] Tuyến đổi giữa kỳ: snapshot giữ nguyên; hồ sơ mới dùng tuyến mới.
- [ ] Legacy Task final-only vẫn duyệt được.
- [ ] SYSTEM_ADMIN không pre-check/final; không role/quyền mới.

---

## 7. Tích hợp, thứ tự merge & quản lý thay đổi

### 7.1. Branch/commit

- Nhánh implementation riêng từ baseline đã merge S4; không dùng nhánh spec.
- Mỗi phase một chuỗi commit/PR nhỏ; migration + code + test cùng phase.
- Không merge phase sau khi phase trước chưa đạt gate.
- Không `git push --force` lên `main`/integration.

### 7.2. Thứ tự migration

1. Phase 1 tables/columns.
2. Phase 2 column/table.
3. Phase 3 route snapshot.
4. Không chạy migration Production; rehearsal trên fixture; backup/rollback.

### 7.3. Feature flag

- `V3_YC09_PER_PERSON` — bật participant UI/API.
- `V3_YC10_QUALITY` — bật quality select/validation.
- `V3_YC11_PRECHECK` — bật route/pre-check.
- Mặc định tắt; bật theo phase sau gate; tắt được khi rollback.
- Flag không thay thế kiểm tra quyền server-side.

### 7.4. Ownership/RACI

| Vai trò | Trách nhiệm |
|---|---|
| **S0** | Mở nhánh, merge gate, cập nhật master, xác nhận SHA/test |
| **Implementation session** | Code/migration/test/evidence theo phase |
| **S4** | Tư vấn approval service; bàn giao sau hotfix; không sửa song song |
| **S2/S3** | Xác nhận monthly/score không bị ảnh hưởng; không đổi contract |
| **S6** | Làm rõ spec; không code trên nhánh spec |
| **Chủ dự án** | Quyết định bổ sung nếu phát sinh ngoài phạm vi APPROVED |

### 7.5. Xung đột dự kiến

- `src/server/approval-case.ts`: S4 và implementation cùng chạm → S0 khóa ownership sau merge.
- Task routes: hotfix S4 và Phase 1 cùng chạm → rebase sau S4, review từng dòng.
- `/approvals` UI: Phase 2/3 cùng chạm → Phase 2 làm quality, Phase 3 làm pre-check; review diff.
- Monthly/export: Phase 2 chỉ thêm sheet phụ; không chạm scoring.

### 7.6. Thứ tự công việc chuẩn trong mỗi phase

1. **Freeze contract**: xác nhận field/route/status/permission với S0; không đổi semantics đã
   APPROVED.
2. **Migration + rehearsal**: tạo migration additive, apply/rollback trên fixture, ghi log.
3. **Domain/service + unit test**: trạng thái, quyền, transaction, audit.
4. **API + security test**: route mới/route cũ, 403/409/422, self-approval, IDOR.
5. **Tích hợp ApprovalCase/Task**: projection, snapshot, decision effect.
6. **UI Desktop/Mobile**: hiển thị/ẩn nút theo quyền; không thay server check.
7. **Regression + score/export + UAT**: chạy test plan phase; lấy evidence.
8. **Handoff S0**: SHA, files, migration, tests pass/not run, UI evidence, security checks,
   production touched: NO; chờ gate.

Không chuyển sang bước sau nếu bước trước fail; không gộp migration + UI + test vào một commit
không review được.

---

## 8. Bảo mật & chất lượng

### 8.1. Security gates

- Không tự duyệt ở mọi bước (participant, pre-check, final, adjustment).
- Collaborator không leo quyền qua legacy route/API.
- `SYSTEM_ADMIN` không có quyền nghiệp vụ.
- IDOR: chỉ người liên quan/tuyến/đơn vị được xem.
- Audit đầy đủ: actor, thời gian, old/new, lý do.
- Không log nội dung nhạy cảm/quality của người khác.
- Không bỏ fail-closed Storage/auth để test PASS.

### 8.2. Quality gates

- `npx tsc --noEmit`
- `npx prisma validate`
- `pnpm build`
- Regression Task/approval hiện hành + test mới từng phase.
- Migration rehearsal + rollback.
- Desktop/Mobile UI evidence.
- Không merge nếu còn P0/P1 bảo mật hoặc test fail chưa giải thích.

---

## 9. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| S4 chưa merge, conflict approval service | Cao | Chờ merge; rebase; S0 khóa ownership |
| Legacy Task `WAITING_REVIEW` bị chặn bởi per-person | Cao | Legacy final-only; không backfill; test |
| Collaborator leo quyền qua route cũ | Cao | Whitelist server; test mọi route; audit |
| S-ALL làm ách vận hành | Trung bình | Ngoại lệ có lý do/audit; UI nêu người thiếu |
| Quality bị dùng sai vào điểm/QĐ1277 | Cao | Tách schema/UI; test score parity; review |
| Thiếu `person_supervisions` | Cao | Read-only verify; chờ phân tuyến; không seed |
| Multi-department deadlock | Trung bình | M2: pre-check từng phần, final một người |
| Migration lịch sử `db push` | Trung bình | Kiểm tra `_prisma_migrations`; rehearsal; backup |
| UI quá tải trên mobile | Trung bình | Panel xếp dọc; test 390px |

---

## 10. Deliverables & Definition of Done

### 10.1. Mỗi phase

- Migration additive + rehearsal report.
- Code service/API/UI + feature flag.
- Test unit/API/UI/security/regression + evidence.
- Audit/notification.
- Handoff theo mẫu master: SHA, files, schema/migration, tests pass/not run, UI evidence,
  security checks, decisions pending, production touched: NO.
- Rollback plan.

### 10.2. Definition of Done toàn chương trình

- [ ] Phase 1/2/3 gate PASS, S0 xác nhận.
- [ ] Không còn P0/P1 bảo mật/tự duyệt/leo quyền.
- [ ] Không thay đổi công thức điểm/QĐ1277/monthly ngoài phạm vi.
- [ ] Legacy Task/PersonalWorkItem vẫn hoạt động.
- [ ] Migration rehearsal + rollback trên fixture.
- [ ] UAT vai trò thật giả lập: chủ trì, collaborator, trưởng/phó bộ phận, lãnh đạo đơn vị,
      quản trị hệ thống.
- [ ] S0 cập nhật master mục 13; chưa deploy Production nếu chưa có lệnh riêng.

---

## 11. Việc không được làm trong implementation

- Không tạo `TEAM_LEADER`/`DEPUTY_LEADER`, `stage`, `Team` entity.
- Không seed `person_supervisions` hoặc gán tuyến mặc định.
- Không gắn quality vào `ProductItem`/`WorkItemProduct`/`MonthlyWorkResult`.
- Không sửa `src/server/scoring/**` để “tận dụng” quality.
- Không tạo ApprovalCase thứ hai cho participant/pre-check.
- Không tự cấp `tasks.precheck`/`approvals.quality.adjust`.
- Không merge `main`, deploy Production, chạy migration/seed trên Production.
- Không hạ chuẩn bảo mật/test để lấy PASS.

---

**KẾT LUẬN:** Kế hoạch này đủ để S0 mở nhánh implementation và giao từng phase. Thứ tự bắt buộc
là **Phase 1 → Phase 2 → Phase 3**; mỗi phase là một gate độc lập, có migration additive,
test/security/regression và rollback. Trên nhánh spec **không thực thi code/schema/migration**.
