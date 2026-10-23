# S6-IMPL — POST-RELEASE HANDOFF (YC-11 PHASE 3 + YC-10 PHASE 2b)

**Ngày:** 24/10/2026  
**Session:** S6-Impl Post-release (overnight)  
**Worktree:** `D:\thanhnx\OpenCode\talung-approval-impl`  
**Branch:** `codex/v3-post-release`  
**Base:** `7ccdb6b` / tag `v3-rc-2026-10-23` (RC frozen — không sửa RC/integration)  
**DB test:** `talung_v3_approval_impl_quality` (localhost) — port `3117`  
**Production touched:** **NO**  
**Merge/deploy:** **MERGED V3.1** — branch `10c5a50` merged into integration `1765aab`; chưa deploy, flags OFF.

> **S0 review 24/10/2026:** đã merge `10c5a50` vào integration `1765aab`; S0 rerun Phase3 80/80 + UI 21/21, quality 120/120 + 15/15, S4 40/40, per-person 42/42, no-self 5/5, e2e 40/40; migration 190000 applied to fixture_integration; tsc/build PASS. S0 bổ sung chặn final khi Task có participant row nhưng thiếu route snapshot (test D5–D6). Flags YC10/YC11 OFF; UAT supervision thật vẫn pending.

```text
SESSION: S6-Impl Post-release
SCOPE:
  A. YC-10 Phase 2b — quick approve + quality picker (GET /api/tasks qualityEnabled)
  B. YC-11 Phase 3 — pre-check/final theo PersonSupervision + route snapshot
BASE_SHA: 7ccdb6b
CODE_COMMITS:
  f73ed07 feat(s6): them quick approve chon chat luong YC-10
  f8ccedb feat(s6): them schema va resolver tuyen pre-check YC-11
  514a9a4 feat(s6): tich hop pre-check va final YC-11
  8a88e8c test(s6): bo test YC-11 pre-check, UI va bang chung
  (handoff commit này theo sau — xem git log)
MIGRATION: 20261023190000_v3_approval_precheck_route (additive)
TESTS (chi tiết: docs/evidence/phase3/TEST_RESULTS_2026-10-24.json):
  - tsc --noEmit: PASS
  - prisma validate: PASS
  - pnpm build: PASS
  - test-v3-yc11-precheck: 78/78 (flag ON)
  - test-yc11-ui: 21/21 (desktop + 390px, flag ON)
  - test-v3-yc10-quality: 120/120 (flag ON)
  - test-yc10-ui: 15/15 (flag ON)
  - Regression flag OFF: yc09 42/42, hardening 40/40, no-self 5/5,
    review 38/38, yc37 25/25, e2e 40/40, yc38-submit 36/36,
    yc38-locked 15/15, transitions 10/10, yc09-ui 5/5,
    permissions 24/24, scoring parity 38/38, monthly-score SCORE-LOGIC-OK
  - Migration rehearsal: APPLY → ROLLBACK → RE-APPLY PASS; data unchanged
UI_EVIDENCE: docs/evidence/phase3/*.png
PRODUCTION_TOUCHED: NO
READY_FOR_S0_REVIEW: YES
```

---

## 1. Phạm vi A — YC-10 Phase 2b (quick approve quality picker)

- `GET /api/tasks` trả `qualityEnabled` ở root và từng Task (flag `V3_YC10_QUALITY`).
- My Work:
  - Bảng desktop có nút **Duyệt hoàn thành** cho lãnh đạo khi Task `WAITING_REVIEW`.
  - Mobile card giữ nút cũ; cả hai mở modal chọn quality **65–100, bước 5** khi flag ON.
  - Gửi `qualityPercent` trong `PATCH /api/tasks` (`CONFIRM_COMPLETION`).
  - Không chọn → chặn client + server 422; đã kiểm tra end-to-end không còn dead-end.
  - Flag OFF: giữ nguyên confirm + payload legacy (không gửi quality).
- Không đổi semantics quality: vẫn Q1/ApprovalDecision, bắt buộc AGREE + TASK_RESULT khi flag ON;
  65 vẫn là AGREE; không tác động điểm/QĐ1277/monthly.

## 2. Phạm vi B — YC-11 Phase 3 (pre-check → final)

### 2.1. Dữ liệu / migration

- Bảng additive `approval_route_snapshots` (migration `20261023190000`):
  - `task_id` NOT NULL, `case_id` NULL, `round`, `route_status`, `route_json`, `created_by_id`.
  - Unique `(task_id, round)`; CHECK `route_status`/`round`; FK Task/Case/Person.
- **Điều chỉnh so với proposal:** proposal ghi `case_id NOT NULL` + unique `(case_id, round)`;
  thực tế S4 chỉ tạo `ApprovalCase` ở lần quyết định đầu, còn snapshot phải ghi lúc owner nộp chung.
  Vì vậy khóa snapshot theo `(task_id, round)`, `case_id` nullable và được gắn khi case được tạo.
- Không sửa migration cũ; không seed `person_supervisions`; không thêm role/permission/stage.

### 2.2. Route resolver — `src/server/approval-route.ts`

- Nguồn: `PersonSupervision` `CONFIRMED`, `effectiveFrom <= now`, `effectiveTo` null/≥ now.
- Mỗi participant (OWNER + COLLABORATOR, trừ VIEWER) lấy manager trực tiếp.
- Loại self; loại người không có tài khoản hoạt động; loại `SYSTEM_ADMIN`; loại participant.
- **Pre-checker không được là người có thẩm quyền final của chính hồ sơ.** Người phụ trách
  trực tiếp nếu là `UNIT_LEADER`/`DEPARTMENT_LEADER` đúng phạm vi sẽ không được pre-check;
  cần Trưởng/Phó khác có supervision. Đây là cách tách bước 1/bước 2 không cần role mới.
- Final candidates = người có thẩm quyền hiện hành theo hành vi `canDecide` (UNIT_LEADER toàn cục;
  DEPARTMENT_LEADER theo phạm vi grant), trừ toàn bộ participant/owner. Không thu hẹp/mở rộng
  quyền (Q-RB1 vẫn chờ quyết định riêng).
- Thiếu tuyến/self/không có tài khoản/chỉ có final authority → `WAITING_ASSIGNMENT`;
  vòng lặp → `CYCLE`; vượt depth 5 → `AMBIGUOUS`. Tất cả đều chặn nộp chung/final; không fallback.
- Một pre-checker là đủ (E11.6); nhiều manager hợp lệ thì một người thực hiện, ghi rõ ai.

### 2.3. Pre-check API/UI

- `POST /api/tasks/[id]/participant-results/[personId]/precheck` body `{ action: PASS|RETURN, note? }`.
  - Không dùng `verifyTaskAccess` WRITE: pre-checker có thể khác bộ phận (M2). Quyền thực tế
    kiểm tra theo tuyến trong service; fail-closed 403.
  - `PASS`: event `PRECHECK_PASS`; participant vẫn `SUBMITTED`; Task vẫn `IN_PROGRESS`; không mở case.
  - `RETURN`: bắt buộc note; participant `RETURNED`; event `PRECHECK_RETURN`; Task vẫn `IN_PROGRESS`.
  - Lặp PASS của pre-checker khác: idempotent 200, không sinh event thứ hai.
- Task detail:
  - Panel “Kiểm tra sơ bộ” hiển thị route, người quyết định cuối, blocker, trạng thái từng phần.
  - Pre-checker thấy nút **Pre-check đạt / Trả lại (pre-check)** đúng phần.
  - Owner/collaborator thấy nút báo phần việc của mình; owner thấy blocker “chưa đủ pre-check”.
  - Timeline có `Kiểm tra sơ bộ đạt/trả lại`.
- `GET /api/tasks/[id]` trả `precheck` (route, snapshot, canSubmitOverall, viewerCanPrecheckAny).
- `GET /api/tasks/[id]/participant-results` trả `precheck` + `canSubmitOverall` đã tính pre-check.

### 2.4. Nộp chung / final

- `submitOverallResult`:
  - Flag ON + Task có participant row không legacy: mọi phần bắt buộc phải `PRECHECK_PASS`
    (hoặc `ACCEPTED/EXEMPT`); owner phải báo phần mình trước; nếu thiếu → 409 kèm blocker.
  - Tạo `approval_route_snapshots` trong cùng transaction với `TaskSubmissionSnapshot`;
    route `READY`; snapshot ghi participant → pre-checker thực tế → final candidates.
  - Route đổi sau khi nộp không viết lại snapshot.
  - Legacy/không participant row: giữ final-only, không tạo snapshot.
- `decideApproval`:
  - Flag ON + có snapshot: người final phải nằm trong `final.candidates` của snapshot,
    không nằm trong `excludedPrecheckerIds`; nếu không → 403.
  - Không có snapshot: legacy final-only (tương thích Task đang `WAITING_REVIEW` trước deploy).
  - `ApprovalCase` vẫn duy nhất `(caseType, resourceId)`; snapshot được gắn `case_id` khi case tạo.
  - `respondToApproval` bị chặn 409 với Task per-person để không tắt bước pre-check.
- `decideParticipantPart` chặn `ACCEPT` trực tiếp khi flag ON (tránh bỏ qua bước 1).

### 2.5. Quyền đọc cho pre-checker

- `verifyTaskAccess READ`: manager có `PersonSupervision` đang hiệu lực được đọc Task của người
  mình phụ trách (kể cả khác bộ phận) để vào pre-check. Chỉ mở READ; WRITE/final vẫn theo tuyến.
- `GET /api/tasks`: bổ sung nhiệm vụ của người mình phụ trách vào phạm vi danh sách (chỉ đọc).

### 2.6. Feature flag

- `V3_YC11_PRECHECK` mặc định **TẮT**; flag OFF giữ nguyên toàn bộ hành vi Phase 1/2/S4.
- `V3_YC10_QUALITY` mặc định **TẮT**; Phase 2b chỉ hoạt động khi bật.

---

## 3. Migration rehearsal

- DB: `talung_v3_approval_impl_quality`.
- Script: `scripts/rehearse-v3-yc11-route-migration.ts`.
- Apply 8 DDL → verify table/columns/index/CHECK/FK → rollback 1 DDL → verify old data unchanged
  → re-apply. **PASS**.
- Rollback SQL: `scripts/sql/v3_approval_precheck_route_rollback.sql`.
- Chi tiết: `docs/evidence/phase3/MIGRATION_REHEARSAL_2026-10-24.{md,json}`.
- DB test clone không có `_prisma_migrations`; rehearsal dùng DDL trực tiếp, **không** `migrate deploy`.
  Release thật cần S1/S0 rehearsal trên bản sao có lịch sử migration đầy đủ.

## 4. Test & bằng chứng

### 4.1. Flag ON

| Bộ | Kết quả |
|---|---|
| `test-v3-yc11-precheck` | **78/78** |
| `test-yc11-ui` | **21/21** (desktop 1440 + mobile 390) |
| `test-v3-yc10-quality` | **120/120** |
| `test-yc10-ui` | **15/15** |

`test-v3-yc11-precheck` bao phủ: missing/self/cycle/final-only route; multi-department;
PASS/RETURN; một pre-checker đủ; idempotent; owner submit khi thiếu pre-check 409; snapshot;
final AGREE; pre-checker/leader ngoài snapshot 403; participant ACCEPTED; một case/decision;
snapshot bất biến; legacy final-only; SYSTEM_ADMIN; self/wrong-route; respond bypass 409;
flag OFF service path; schema/CHECK; không đổi role/permission/monthly/QĐ1277.

`test-yc11-ui` bao phủ: quick approve desktop + 390 không còn 422 dead-end; quality 65/70 lưu;
pre-check panel; PASS; owner ready; preview có lịch sử pre-check; final AGREE + quality;
mobile 390 không tràn ngang.

### 4.2. Regression flag OFF

| Bộ | Kết quả |
|---|---|
| `test-v3-yc09-per-person` | 42/42 |
| `test-v3-task-approval-hardening` | 40/40 |
| `test-v3-no-self-approval` | 5/5 |
| `test-v3-review-flow` | 38/38 |
| `test-yc37-approval-flow` | 25/25 |
| `test-v3-e2e-flow` | 40/40 |
| `test-yc38-submit-approval` | 36/36 |
| `test-yc38-locked-task` | 15/15 |
| `test-task-transitions` | 10/10 |
| `test-yc09-phase1-ui` | 5/5 |
| `test-v3-permissions` | 24/24 |
| `test-yc33-scoring-parity` | 38/38 |
| `test-monthly-score` | `SCORE-LOGIC-OK` |

- Logs: `docs/evidence/phase3/logs/`.
- Không sửa test expectation; không xóa test.

### 4.3. UI evidence

- `docs/evidence/phase3/01-quick-approve-desktop-modal.png`
- `docs/evidence/phase3/02-quick-approve-mobile-390.png`
- `docs/evidence/phase3/03-precheck-desktop-panel.png`
- `docs/evidence/phase3/04-precheck-desktop-after-pass.png`
- `docs/evidence/phase3/05-owner-precheck-ready-desktop.png`
- `docs/evidence/phase3/06-approval-precheck-history-desktop.png`
- `docs/evidence/phase3/07-precheck-mobile-390.png`

---

## 5. Không làm / quyết định chưa chốt

- Không merge `integration`/`main`, không deploy, không ghi Production.
- Không sửa scoring, QĐ1277, `ProductItem`, `WorkItemProduct`, `MonthlyWorkResult`,
  `EvaluationAssessment`, Bảng 1, export chính thức.
- Không thêm role/stage/team/permission; không seed `person_supervisions`.
- Không làm Q2 (quality per-person), không đặt ngưỡng tối thiểu 65–70.
- Không quyết định thay các hạng mục còn chờ: **D5/B-C-3, S5 E13, B1/B2/C1, E8/E12**.
  Các hạng mục này không bị dùng/giả định trong code YC-11/2b.
- Không thu hẹp quyền `UNIT_LEADER` (Q-RB1) — giữ đúng `canDecide` hiện hành.

## 6. Blocker / rủi ro còn lại

1. **Dữ liệu tuyến thật:** local fixture có 2 supervision demo + fixture test; **chưa có UAT
   dữ liệu thật**. Production `person_supervisions` cần được xác minh read-only trước khi bật flag.
   Flag phải giữ **OFF** nếu chưa đủ tuyến; hệ thống sẽ `WAITING_ASSIGNMENT`, không fallback.
2. **Trưởng bộ phận vừa là final authority vừa là manager trực tiếp:** route sẽ `WAITING_ASSIGNMENT`
   nếu không có pre-checker khác (Phó/Trưởng khác có supervision). Đây là hệ quả của nguyên tắc
   tách bước/không tự duyệt; cần dữ liệu phân công thật.
3. **Chưa có hàng chờ pre-check riêng:** pre-checker dùng danh sách Task + panel Task detail.
   Nếu S0/UAT yêu cầu queue riêng, cần bổ sung UI (không đổi API/DB).
4. **`respondToApproval` per-person bị chặn 409** có chủ đích để tránh bypass pre-check;
   owner phải báo lại phần việc/nộp kết quả chung. Cần UAT luồng CLARIFY để xác nhận UX.
5. **Snapshot final candidates khóa theo thời điểm nộp:** lãnh đạo mới sau khi nộp không final
   được hồ sơ đang mở (E11.7). Đúng snapshot nhưng cần vận hành biết.
6. **Migration history test clone** không có `_prisma_migrations`; release thật cần rehearsal S1/S0.
7. **Quick approve desktop** dùng nút mới trong bảng My Work; mobile giữ card. Cần UAT thiết bị thật.
8. Chưa chạy UAT người dùng thật/role thật; mới fixture + role giả lập.

## 7. Lệnh chạy lại

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_approval_impl_quality"
$env:DIRECT_URL=$env:DATABASE_URL
$env:TEST_BASE_URL="http://localhost:3117"
$env:TEST_PASSWORD="LocalTest@2026"

npx tsc --noEmit
npx prisma validate
pnpm build

# Server flag ON cho YC-11 + YC-10:
# $env:V3_YC11_PRECHECK="true"; $env:V3_YC10_QUALITY="true"; pnpm dev -- -p 3117
npx tsx scripts/rehearse-v3-yc11-route-migration.ts
npx tsx scripts/test-v3-yc11-precheck.ts
npx tsx scripts/test-yc11-ui.ts
npx tsx scripts/test-v3-yc10-quality.ts
npx tsx scripts/test-yc10-ui.ts

# Regression: server flag OFF
# $env:V3_YC11_PRECHECK="false"; $env:V3_YC10_QUALITY="false"; pnpm dev -- -p 3117
npx tsx scripts/test-v3-yc09-per-person.ts
npx tsx scripts/test-v3-task-approval-hardening.ts
npx tsx scripts/test-v3-no-self-approval.ts
npx tsx scripts/test-v3-review-flow.ts
npx tsx scripts/test-yc37-approval-flow.ts
npx tsx scripts/test-v3-e2e-flow.ts
npx tsx scripts/test-yc38-submit-approval.ts
npx tsx scripts/test-yc38-locked-task.ts
npx tsx scripts/test-task-transitions.ts
npx tsx scripts/test-yc09-phase1-ui.ts
```

**Kết luận:** Phạm vi A + B đã hoàn tất trên branch post-release, có migration rehearsal, test
flag ON/OFF, UI desktop/mobile và handoff. Không merge/deploy/ghi Production. Chờ S0 review.
