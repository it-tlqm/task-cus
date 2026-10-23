# S6 — TEST PLAN 3 PHASE (YC-09 → YC-10 → YC-11)

**Ngày:** 23/10/2026  
**Trạng thái:** **APPROVED TEST PLAN** — căn cứ `S0_DECISION_LOG_2026-10-23.md`  
**Nhánh spec:** `codex/v3-approval-rules-spec` — không chạy test runtime, không DB/port  
**Nhánh implementation:** S0 mở sau khi xác nhận baseline `70ea5d7` (S4 đã merge)  
**Tài liệu liên quan:**
- `docs/V3/S6_IMPLEMENTATION_PLAN_3_PHASES_2026-10-23.md`
- `docs/V3/S6_MIGRATION_PROPOSAL_3_PHASES_2026-10-23.md`

---

## 1. Chiến lược & môi trường

### 1.1. Mục tiêu kiểm thử

- Chứng minh 3 phase đúng quyết định APPROVED, không mở rộng quyền/phạm vi.
- Chứng minh legacy Task/PersonalWorkItem/ApprovalCase vẫn hoạt động.
- Chứng minh quality không ảnh hưởng Bảng 1/QĐ1277/monthly/export chính thức.
- Chứng minh không tự duyệt/leo quyền/IDOR ở mọi đường API/UI.
- Chứng minh migration additive + rollback giữ dữ liệu.

### 1.2. Môi trường

| Môi trường | Dữ liệu | Mục đích |
|---|---|---|
| Fixture implementation | Clone fixture, dữ liệu giả lập | Unit/API/DB/UI/regression |
| Migration rehearsal | Bản sao schema + dữ liệu gần nhất | Apply/rollback 3 phase |
| UAT local | Tài khoản vai trò thật giả lập | Desktop/Mobile, quy trình |
| Production | **Không dùng** | Không test/ghi/seed |

- Không dùng credential/DB Production.
- Không bỏ fail-closed Storage/auth để test PASS.
- Mỗi phase dùng DB fixture riêng hoặc reset fixture có kiểm soát; không dùng chung DB ghi với
  session khác.

### 1.3. Quy ước status code

| Mã | Dùng khi |
|---|---|
| **403** | Không có quyền, tự duyệt, sai vai trò, collaborator ghi shared field |
| **409** | Trạng thái không hợp lệ/khóa/duplicate/stale; S-ALL chưa đủ; tuyến chưa sẵn sàng |
| **422** | Thiếu/sai dữ liệu đầu vào: result text, ngày, quality, quality ngoài tập |
| **200/201** | Thành công; trả projection/ID cần thiết |
| **404** | Không tìm thấy resource trong phạm vi được phép |

### 1.4. Baseline S4 (integration `70ea5d7`)

S4 đã merge tại `5d5c299` (code `e198187`) và **không đổi schema**. Trước Phase 1 phải chạy lại:

- `test-v3-task-approval-hardening.ts` — 40/40
- `test-v3-no-self-approval.ts` — 5/5
- `test-yc37-approval-flow.ts` — 25/25
- `test-v3-review-flow.ts` — 38/38
- `test-yc38-submit-approval.ts` — 36/36
- `test-yc38-locked-task.ts` — 15/15
- `test-v3-e2e-flow.ts` — 40/40
- `tsc`, `prisma validate`, `build`

Các bộ này là **regression bắt buộc** cho Phase 1; nếu fail, dừng trước khi thêm participant.

---

## 2. Phase 1 — YC-09 per-person

### 2.1. Unit/service tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P1-U01 | Khởi tạo participant result cho Task có owner + 2 collaborator | 3 dòng; owner `OWNER`, còn lại `COLLABORATOR`; không tạo VIEWER |
| P1-U02 | Collaborator submit phần mình | Chỉ participant đó `SUBMITTED`; Task vẫn `IN_PROGRESS` |
| P1-U03 | Submit thiếu `partResultText`/`partCompletedOn` | 422; không ghi event |
| P1-U04 | Submit khi Task `WAITING_REVIEW`/`COMPLETED` | 409; không ghi |
| P1-U05 | Return phần việc | `RETURNED`; note bắt buộc; event `RETURN`; round tăng khi gửi lại |
| P1-U06 | Accept phần việc | `ACCEPTED`; chỉ người có thẩm quyền; audit |
| P1-U07 | Exempt phần việc | `EXEMPT`; note + actor + audit; chỉ leader |
| P1-U08 | S-ALL: còn 1 người chưa báo | `canSubmitOverall=false`; danh sách missing đúng |
| P1-U09 | S-ALL: tất cả SUBMITTED/ACCEPTED/EXEMPT | `canSubmitOverall=true` |
| P1-U10 | E9.3: final AGREE | Tất cả bắt buộc `ACCEPTED`; Task `COMPLETED` |
| P1-U11 | E9.3: final REJECT, chọn 1 phần | Phần chọn `RETURNED`; phần `ACCEPTED` giữ; Task `IN_PROGRESS` |
| P1-U12 | E9.3: final CLARIFY, không chọn phần | Phần chưa accepted `RETURNED`; accepted giữ |
| P1-U13 | E9.6: hai quyết định final | Chỉ một quyết định thành công; lần sau 409 |
| P1-U14 | Legacy Task không có participant rows | Đọc owner-only; S-ALL không chặn; final chạy như cũ |
| P1-U15 | Tiến độ Task không lấy trung bình participant | `Task.progressPercent` giữ nguồn hiện tại; không tự đổi |
| P1-U16 | Participant event append-only | Không update/delete; sửa bằng event mới |

### 2.2. API & security tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P1-A01 | Collaborator gửi `actualResultText` qua updates | 403/422; không success; không ghi đè |
| P1-A02 | Collaborator PATCH title/description/priority/deadline | 403; không đổi |
| P1-A03 | Collaborator PATCH `assigneeIds` | 403; danh sách không đổi |
| P1-A04 | Collaborator PATCH `ownerId` | 403; owner không đổi |
| P1-A05 | Collaborator set `status=WAITING_REVIEW` | 403/409; Task không đổi |
| P1-A06 | Collaborator set `status=COMPLETED/CANCELED` | 403; không đổi |
| P1-A07 | Collaborator gọi submit-overall | 403 |
| P1-A08 | Owner submit-overall thiếu S-ALL | 409 kèm `missingParticipants`; không đổi status/case |
| P1-A09 | Owner submit-overall đủ S-ALL | 200; Task `WAITING_REVIEW`; case OPEN/đúng round; snapshot |
| P1-A10 | Owner submit khi đã WAITING_REVIEW | 409; không tạo event/case trùng |
| P1-A11 | Leader trả lại phần việc của người khác | 200; note/audit; notification |
| P1-A12 | Leader tự trả/chấp nhận phần của chính mình | 403 |
| P1-A13 | Collaborator trả/chấp nhận phần người khác | 403 |
| P1-A14 | `ApprovalCase.submittedById` | Là owner thực nộp; không tự lấy owner nếu người nộp khác (trường hợp ủy quyền tương lai) |
| P1-A15 | `reopenApprovalCaseOnResubmit` bởi collaborator | 403; không mở vòng |
| P1-A16 | Reopen bởi owner | Mở đúng round; actor đúng; audit |
| P1-A17 | IDOR: collaborator Task khác | 403; audit IDOR |
| P1-A18 | SYSTEM_ADMIN gọi API Task | 403; không nghiệp vụ |
| P1-A19 | Double submit đồng thời | Một thành công; còn lại 409/dedup; không mất event |
| P1-A20 | Audit old/new | Có đủ actor, thời gian, trạng thái, lý do |
| P1-A21 | Collaborator gửi progress 100/notes | Không làm `Task.progressPercent` = 100; chỉ participant progress |
| P1-A22 | Collaborator set `IN_PROGRESS`/issue fields | 403; Task status/issue không đổi; note ghi qua participant API |
| P1-A23 | `submittedById` sau owner nộp | Là owner/người nộp thật; không bị ghi đè khi final decision |
| P1-A24 | Reopen bởi collaborator (defense-in-depth) | 403/không mở vòng; owner mở đúng |
| P1-A25 | Một ApprovalCase/Task | Không tạo case thứ hai cho participant |
| P1-A26 | Collaborator `ACCEPT_TASK` | Participant `IN_PROGRESS`; Task status không đổi nếu owner chưa bắt đầu |
| P1-A27 | Owner nộp trước quyết định | Case count 0; snapshot `(task,round)` có; sau quyết định case 1, `submittedById` đúng |
| P1-A28 | Resubmit sau REJECT | Snapshot round 2; `ApprovalCase.currentRound` 2 sau reopen; không trùng snapshot |

### 2.3. DB/migration tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P1-D01 | Apply migration Phase 1 lên fixture | Bảng/cột/index/check đúng; không lỗi |
| P1-D02 | Unique `(task_id, person_id)` | Không tạo trùng |
| P1-D03 | Check `part_status`/progress/round | Giá trị sai bị từ chối |
| P1-D04 | Legacy Task đọc sau migration | Không lỗi; không có dòng giả |
| P1-D05 | `task_updates` cũ | `subject_person_id/participant_event_id` NULL; đọc bình thường |
| P1-D06 | `task_submission_snapshots` unique `(task_id, round)` | Không trùng; snapshot cũ không đổi |
| P1-D07 | `ApprovalCase` tạo ở lần quyết định đầu | Không có case lúc submit; snapshot vẫn có; không case treo khi Task hủy |
| P1-D08 | Rollback Phase 1 | Bảng/cột mới drop; Task/ApprovalCase cũ nguyên |
| P1-D09 | Không chạm bảng QĐ1277/monthly/scoring | Schema diff chỉ trong phạm vi |
| P1-D10 | S4 baseline không có schema/migration | Không có migration S4; Phase 1 là migration mới sau `20261023120000` |
| P1-D11 | `TaskUpdate.kind` S4 | `accept/submit/approve/return/progress/extend/cancel` giữ nguyên nghĩa |

### 2.4. UI tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P1-UI01 | Desktop Task detail | Participant list, badge, nút own part/overall đúng vai trò |
| P1-UI02 | Mobile 390px | Panel xếp dọc, không tràn, nút bấm được |
| P1-UI03 | Collaborator xem Task | Không thấy nút nộp chung/đổi assignee/cancel |
| P1-UI04 | Owner xem Task | Thấy blocker “chưa báo”, nút nộp chung disabled/enabled đúng |
| P1-UI05 | Leader xem Task/Approvals | Thấy phần việc, trả/chấp nhận; không thấy nút tự duyệt |
| P1-UI06 | Legacy Task | Không hiện panel participant rỗng gây hiểu nhầm; có nhãn phù hợp |
| P1-UI07 | Sau final AGREE/REJECT | UI cập nhật đúng, không stale; deep link đúng |
| P1-UI08 | my-work drawer collaborator | Không có nút “Báo hoàn thành & Trình duyệt”; chỉ lưu phần việc |
| P1-UI09 | my-work drawer owner | Có nút nộp chung; disabled khi S-ALL fail |

### 2.5. Regression Phase 1

| ID | Bộ | Kỳ vọng |
|---|---|---|
| P1-R01 | `test-v3-review-flow` | PASS |
| P1-R02 | `test-yc38-submit-approval` | PASS |
| P1-R03 | `test-v3-no-self-approval` | PASS |
| P1-R04 | `test-monthly-score`/parity | PASS; không đổi công thức |
| P1-R05 | QĐ1277 multi-product | Không sinh dòng/số lượng trùng |
| P1-R06 | PersonalWorkItem standalone | Không bị chặn/không mở per-person |
| P1-R07 | Plan/Deadline approval | Không đổi |
| P1-R08 | `test-v3-task-approval-hardening` | 40/40 PASS (S4 baseline) |
| P1-R09 | `test-yc37-approval-flow`/`test-yc38-submit-approval` | PASS; một case/decision, không trùng |

---

## 3. Phase 2 — YC-10 quality

### 3.1. Unit/service tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P2-U01 | Validate 65/70/75/80/85/90/95/100 | Hợp lệ |
| P2-U02 | Validate 60/64/66/72/99/101/65.5 | 422 |
| P2-U03 | Default quality | NULL; không tự 100/65 |
| P2-U04 | AGREE TASK_RESULT thiếu quality | 422; case/Task không đổi |
| P2-U05 | AGREE TASK_RESULT quality 65 | Thành công; Task COMPLETED; decision quality 65 |
| P2-U06 | AGREE quality 100 | Thành công; không tự đổi điểm |
| P2-U07 | REJECT/CLARIFY không quality | Thành công |
| P2-U08 | REJECT/CLARIFY có quality | Lưu lịch sử; không điều kiện |
| P2-U09 | Chỉ một quality/decision | Không overwrite; mỗi vòng một giá trị |
| P2-U10 | History theo round | Giữ các vòng; preview đọc đúng |
| P2-U11 | E10.6 visibility | Owner/tuyến/decider xem; collaborator không mặc định |
| P2-U12 | E10.7 no aggregation | Không tự lấy trung bình/nhân hệ số |
| P2-U13 | Direct update quality sau decision | 409/403; không đổi |
| P2-U14 | Adjustment old/new | Lưu đúng; không update đè |
| P2-U15 | Quality hiệu lực sau adjustment APPROVED | Đọc original + adjustment mới nhất; UI/export ghi “điều chỉnh” |

### 3.2. API & security tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P2-A01 | Quyết định AGREE không quality | 422; case OPEN; Task `WAITING_REVIEW` |
| P2-A02 | Quality ngoài tập | 422; không ghi decision |
| P2-A03 | Quality đúng | 200; decision + case + Task nhất quán |
| P2-A04 | Collaborator gửi quality | 403 |
| P2-A05 | Tự duyệt + quality | 403 |
| P2-A06 | SYSTEM_ADMIN gửi quality | 403 |
| P2-A07 | Quality của case PLAN/DEADLINE | Không bắt buộc; không áp dụng |
| P2-A08 | Adjustment request thiếu reason | 422 |
| P2-A09 | Tự yêu cầu + tự duyệt adjustment | 403 |
| P2-A10 | Adjustment approve | Cập nhật quality theo cơ chế lịch sử; old/new/audit |
| P2-A11 | Adjustment reject | Giữ quality cũ; audit |
| P2-A12 | Xem quality trái quyền | 403/không trả dữ liệu |
| P2-A13 | Audit quality set/adjust | Đủ actor/thời gian/old-new/reason |

### 3.3. DB/migration tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P2-D01 | Apply migration Phase 2 | Cột/check/bảng đúng |
| P2-D02 | Decision cũ | `quality_percent` NULL; đọc bình thường |
| P2-D03 | Check quality 60/72/99 | DB từ chối (nếu app bypass) |
| P2-D04 | Adjustment FK/unique/index | Đúng; không mồ côi |
| P2-D05 | Rollback Phase 2 | Cột/bảng drop; decision cũ nguyên |
| P2-D06 | Không chạm monthly/QĐ1277/scoring | Schema diff đúng phạm vi |

### 3.4. Score/export regression

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P2-S01 | Bảng 1 trước/sau quality | `a,b,c,d,score70` không đổi |
| P2-S02 | `reworkCount/lateCount` | Không bị quality thay đổi |
| P2-S03 | `MonthlyWorkResult` | Không sinh/sửa dòng |
| P2-S04 | `EvaluationAssessment.taskResultScore/finalGrade` | Không đổi |
| P2-S05 | QĐ1277 `convertFactor/pointValue/maxScore` | Không đổi |
| P2-S06 | Export 01A/01B/02A/02B | Ô chính thức không đổi |
| P2-S07 | Sheet phụ quality | Đúng dữ liệu; null hiển thị “chưa đánh giá” |
| P2-S08 | Kỳ đã chốt | Không tự tính lại/không hồi tố |
| P2-S09 | Quality hiệu lực sau adjustment | Export/read model dùng giá trị điều chỉnh mới nhất; không sửa decision gốc |

### 3.5. UI tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P2-UI01 | Modal duyệt TASK_RESULT | Select 65–100; bắt buộc khi AGREE |
| P2-UI02 | Bỏ trống quality + AGREE | UI chặn + message rõ; không gửi hoặc server 422 |
| P2-UI03 | Quality 65 + AGREE | Xác nhận thành công; hiển thị quality |
| P2-UI04 | Lịch sử quality | Theo vòng; không mất dữ liệu cũ |
| P2-UI05 | Adjustment | Form lý do; trạng thái chờ/đã xử lý |
| P2-UI06 | Mobile | Select/validate/history không tràn |
| P2-UI07 | Collaborator xem Task | Không thấy quality mặc định |

---

## 4. Phase 3 — YC-11 pre-check/final

### 4.1. Route resolver tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P3-R01 | Participant có 1 manager CONFIRMED/effective | `READY`; prechecker đúng |
| P3-R02 | Không có supervision | `WAITING_ASSIGNMENT`; không fallback |
| P3-R03 | Supervision hết hiệu lực | `WAITING_ASSIGNMENT` |
| P3-R04 | Self-supervision | Loại self; nếu không còn ai → `WAITING_ASSIGNMENT` |
| P3-R05 | Cycle A→B→A | `CYCLE`; không treo/không chọn bừa |
| P3-R06 | Nhiều manager | Chọn theo quy tắc đã chốt (một prechecker); ghi rõ ai |
| P3-R07 | Prechecker trùng final approver | `WAITING_ASSIGNMENT`/yêu cầu người khác |
| P3-R08 | Multi-department | Participant mỗi bộ phận resolve tuyến riêng |
| P3-R09 | Depth vượt giới hạn | `AMBIGUOUS`/`WAITING_ASSIGNMENT`; không tự chọn |
| P3-R10 | Route snapshot | Lưu đúng participant→prechecker→final; không ghi đè |

### 4.2. Pre-check API/security tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P3-A01 | Prechecker PASS phần đúng tuyến | Event `PRECHECK_PASS`; participant vẫn `SUBMITTED`; không mở case |
| P3-A02 | Prechecker RETURN | Participant `RETURNED`; note bắt buộc; Task `IN_PROGRESS` |
| P3-A03 | Không phải prechecker | 403 |
| P3-A04 | Tự pre-check phần mình | 403 |
| P3-A05 | Pre-check khi Task `WAITING_REVIEW`/terminal | 409 |
| P3-A06 | Pre-check khi participant chưa `SUBMITTED` | 409/422 |
| P3-A07 | Thiếu tuyến | 409 `WAITING_ASSIGNMENT`; không ai duyệt |
| P3-A08 | Prechecker PASS tất cả; owner submit | Thành công; case mở; route snapshot |
| P3-A09 | Owner submit khi còn phần chưa pre-check | 409; nêu phần thiếu |
| P3-A10 | Final AGREE sau pre-check | Task `COMPLETED`; participant accepted; một case |
| P3-A11 | Final REJECT sau pre-check | Task `IN_PROGRESS`; phần chọn `RETURNED`; accepted giữ |
| P3-A12 | Prechecker trùng final | 403/block; yêu cầu người khác |
| P3-A13 | Tuyến đổi sau khi nộp | Snapshot giữ; case không đổi người duyệt |
| P3-A14 | Legacy Task WAITING_REVIEW | Final-only; không bắt pre-check |
| P3-A15 | SYSTEM_ADMIN pre-check/final | 403 |
| P3-A16 | Một người pre-check là đủ | Không chờ người thứ hai; ghi actor |
| P3-A17 | Nhiều người pre-check | Một người PASS là đủ (E11.6); người khác không bị lỗi |
| P3-A18 | Multi-department | Mỗi phần pre-check đúng tuyến; final đơn vị chủ trì |
| P3-A19 | Notification | Prechecker/owner/participant nhận đúng; không gửi “đã duyệt” sớm |
| P3-A20 | Audit | stage event/actor/old-new/route snapshot đầy đủ |
| P3-A21 | Gửi lại sau REJECT/CLARIFY | Pre-check lại phần bị trả; phần ACCEPTED giữ; route snapshot vòng mới |

### 4.3. DB/migration tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P3-D01 | Apply migration Phase 3 | Bảng route snapshot đúng |
| P3-D02 | Unique `(case_id, round)` | Không trùng |
| P3-D03 | Case cũ không snapshot | Đọc final-only; không lỗi |
| P3-D04 | Rollback Phase 3 | Bảng drop; case/event cũ nguyên |
| P3-D05 | Không thêm role/permission/seed | Schema diff đúng |
| P3-D06 | `person_supervisions` không đổi | Count/rows giữ nguyên |

### 4.4. UI tests

| ID | Tình huống | Kỳ vọng |
|---|---|---|
| P3-UI01 | Prechecker thấy hàng chờ | Đúng phần, đúng người, nút PASS/RETURN |
| P3-UI02 | Prechecker không có tuyến | Không thấy nút; message “chờ phân tuyến” |
| P3-UI03 | Owner thấy blocker pre-check | Danh sách phần chưa pre-check; không nộp chung |
| P3-UI04 | Final approver thấy lịch sử pre-check | Đúng timeline; quality (nếu Phase 2) |
| P3-UI05 | Mobile | Hàng chờ/nút không tràn |
| P3-UI06 | Legacy Task | Không hiện pre-check giả; final-only |

---

## 5. Cross-phase regression matrix

| ID | Khu vực | Kỳ vọng |
|---|---|---|
| X-01 | Task create/assign/edit | Không đổi ngoài quyền collaborator bị siết |
| X-02 | PersonalWorkItem submit/review | Không đổi; Task-linked vẫn 409 |
| X-03 | ApprovalCase PLAN/DEADLINE | Không đổi |
| X-04 | ApprovalCase TASK_RESULT legacy | Vẫn duyệt; không bắt quality nếu decision cũ? Quality chỉ bắt buộc cho AGREE mới |
| X-05 | QĐ1277 multi-product | Không sinh dòng/số lượng trùng |
| X-06 | MonthlyWorkResult | Không sinh/sửa do per-person/quality |
| X-07 | Bảng 1/score70/c | Không đổi |
| X-08 | `EvaluationAssessment` | Không đổi `taskResultScore/finalGrade` |
| X-09 | Export XLSX | Không đổi ô chính thức; sheet phụ đúng |
| X-10 | Role/Permission | Không thêm role/mã quyền/seed |
| X-11 | SYSTEM_ADMIN | Không truy cập nghiệp vụ |
| X-12 | Audit | Không mất event; không log secret |
| X-13 | Notification | Không spam/không sai người |
| X-14 | Performance | Task list/detail không N+1 nghiêm trọng; p95 chấp nhận |
| X-15 | Migration order | Phase 1→2→3 apply/rollback sạch |

---

## 6. Fixtures & tài khoản cần chuẩn bị

### 6.1. Tài khoản/vai trò

- Owner (STAFF) — chủ trì Task.
- Collaborator A, B (STAFF) — cùng/khác bộ phận.
- Viewer (nếu có) — chỉ đọc.
- Trưởng bộ phận (`DEPARTMENT_LEADER`) — pre-check/final trong đơn vị.
- Phó bộ phận (`DEPT_DEPUTY`, role STAFF) — có/không có supervision.
- Lãnh đạo đơn vị (`UNIT_LEADER`) — final.
- Lãnh đạo đơn vị thứ hai — kiểm tra self-approval/nhiều người.
- `SYSTEM_ADMIN` — kiểm tra bị chặn nghiệp vụ.

### 6.2. Dữ liệu

- Task legacy 1 owner, không participant.
- Task 1 owner + 2 collaborator cùng bộ phận.
- Task 1 owner + collaborator khác bộ phận (M2).
- Task gắn `PersonalWorkItem`.
- Task gắn 2 sản phẩm QĐ1277.
- Task `WAITING_REVIEW` trước deploy (legacy).
- Task `COMPLETED`/`CANCELED`.
- `PersonSupervision`: route đủ, thiếu, cycle, hết hiệu lực, self, nhiều manager, deputy.
- Monthly result + score run với `reworkCount`/`lateCount` để kiểm tra parity.
- Approval decisions cũ quality NULL.
- Export template 01A/01B/02A/02B hiện có.

### 6.3. Nguyên tắc fixture

- Không dùng dữ liệu Production/danh tính thật.
- Không seed `person_supervisions` Production.
- Fixture phải tạo được route mong muốn và xóa/reset được.
- Không dùng chung DB ghi với session khác.

---

## 7. Lệnh & bằng chứng

### 7.1. Lệnh bắt buộc (implementation branch)

```powershell
npx tsc --noEmit
npx prisma validate
pnpm build
npx tsx scripts/test-v3-yc09-per-person.ts
npx tsx scripts/test-v3-yc10-quality.ts
npx tsx scripts/test-v3-yc11-precheck.ts
# + các bộ regression hiện hành:
# test-v3-review-flow, test-yc38-submit-approval, test-v3-no-self-approval,
# test-monthly-score, test-yc33-scoring-parity, test-yc30-regression
```

### 7.2. Bằng chứng cần nộp

- Log test từng bộ: tên, pass/fail, thời điểm, DB/fixture.
- Migration apply/rollback log + schema diff.
- Ảnh UI Desktop/Mobile: Task detail, Approvals modal, pre-check queue, quality select.
- Audit rows mẫu: participant submit/return, quality set/adjust, pre-check, final.
- Score/export diff: trước/sau quality không đổi; sheet phụ đúng.
- Security matrix: self-approval, collaborator, IDOR, SYSTEM_ADMIN.
- Danh sách test không chạy + lý do + tác động.

### 7.3. Không được coi là PASS

- Chỉ render UI mà không kiểm tra server.
- Test chỉ happy path, bỏ self-approval/legacy.
- Test DB Production hoặc seed tuyến thật.
- Bỏ qua test score/export vì “không liên quan”.
- Sửa test expectation để khớp code sai.

---

## 8. Exit criteria & blocker

### 8.1. Exit criteria mỗi phase

- [ ] Tất cả test phase PASS; không còn P0/P1 bảo mật.
- [ ] Migration rehearsal apply/rollback PASS.
- [ ] Legacy Task/PersonalWorkItem/ApprovalCase PASS.
- [ ] Không đổi QĐ1277/monthly/scoring ngoài phạm vi.
- [ ] UI Desktop/Mobile PASS; audit/notification PASS.
- [ ] S0 review diff + evidence; cập nhật trạng thái.

### 8.2. Blocker tuyệt đối

- Tự duyệt/leo quyền/IDOR.
- Collaborator ghi đè shared result/assignee/cancel.
- Quality làm đổi điểm/Bảng 1/QĐ1277 ngoài quyết định.
- Migration phá dữ liệu cũ/không rollback.
- Thiếu tuyến nhưng fallback/cấp quyền tự động.
- Test fail chưa giải thích hoặc bị skip để lấy PASS.
- Production bị chạm.

---

## 9. UAT matrix (vai trò × kịch bản)

| Vai trò | Kịch bản | Kỳ vọng |
|---|---|---|
| Collaborator | Gửi phần mình; sửa khi bị trả | Thành công; không thấy nút shared |
| Collaborator | Thử nộp chung/đổi assignee | Bị chặn; message rõ |
| Owner | Nộp chung khi thiếu phần | Bị chặn; thấy người thiếu |
| Owner | Nộp chung khi đủ | Task WAITING_REVIEW |
| Trưởng bộ phận | Pre-check pass/return | Đúng phần; không final thay |
| Phó bộ phận | Pre-check khi có tuyến | Thành công; final không mặc định |
| Lãnh đạo đơn vị | Final AGREE + quality | Task COMPLETED; quality lưu |
| Lãnh đạo đơn vị | Final REJECT chọn phần | Phần chọn RETURNED; accepted giữ |
| Lãnh đạo đơn vị | Tự duyệt | Bị chặn |
| Quản trị hệ thống | Truy cập Task/duyệt | Bị chặn |
| Nhiều bộ phận | Mỗi phần pre-check/final | Đúng tuyến; không deadlock |
| Thiếu tuyến | Cố duyệt | Chờ phân tuyến; không fallback |

**Thiết bị:** Desktop 1440px + Mobile 390px; kiểm tra deep link, refresh, stale state.

---

## 10. Security checklist

- [ ] Không tự duyệt ở participant/pre-check/final/adjustment.
- [ ] Collaborator không sửa shared fields/assignee/owner/status/cancel.
- [ ] API không trả success khi bỏ dữ liệu.
- [ ] `SYSTEM_ADMIN` không có quyền nghiệp vụ.
- [ ] IDOR: chỉ người liên quan/tuyến/đơn vị xem.
- [ ] Quality không lộ cho người không có quyền.
- [ ] Audit đủ actor/thời gian/old-new/lý do.
- [ ] Không log secret/nội dung nhạy cảm.
- [ ] Không bỏ fail-closed Storage/auth để test PASS.
- [ ] Không seed tuyến/role/quyền.

---

## 11. Test không chạy & giới hạn

Trên nhánh spec:

- **Không chạy** bất kỳ test runtime nào; không DB/port; không code thay đổi.
- Test plan này là **điều kiện gate**, không phải bằng chứng PASS.
- Khi implementation branch mở, phải chạy lại toàn bộ theo mục 7 và ghi rõ bộ nào chưa chạy.

---

**KẾT LUẬN:** Test plan bao phủ đủ 3 phase, cross-phase regression, security, migration và UAT.
Mỗi phase chỉ được chuyển tiếp khi exit criteria đạt; mọi blocker bảo mật/dữ liệu phải dừng merge.
