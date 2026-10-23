# S6-IMPL — HANDOFF PHASE 2 (YC-10 QUALITY 65–100)

**Ngày:** 23/10/2026  
**Session:** S6-Impl — Phase 2  
**Worktree:** `D:\thanhnx\OpenCode\talung-approval-impl`  
**Branch:** `codex/v3-approval-quality`  
**Base:** `3eef97e` (integration — đã gồm S2 B-C-2, S3 target-only, S4, S5, S6 Phase 1)  
**DB test:** `talung_v3_approval_impl_quality` (localhost) — port `3117`  
**Production touched:** **NO**  
**Trạng thái:** READY FOR S0 REVIEW (chưa merge integration/main)

```text
SESSION: S6-Impl — Phase 2 (YC-10 quality 65–100)
YC: YC-10
BRANCH: codex/v3-approval-quality
BASE_SHA: 3eef97e
COMMITS:
  b0f03e0 feat(s6): them cau truc du lieu chat luong YC-10
  8cfccd7 feat(s6): xu ly chat luong 65-100 va dieu chinh YC-10
  dd69cfc feat(s6): giao dien chat luong YC-10
  6dde386 test(s6): bo test chat luong YC-10 va bang chung
  (docs commit: handoff phase 2 YC-10 — SHA thực tế xem `git log`)
MIGRATION: 20261023180000_v3_approval_quality (additive)
TESTS:
  - tsc --noEmit: PASS
  - prisma validate: PASS
  - pnpm build: PASS
  - test-v3-yc10-quality: 107/107
  - test-yc10-ui: 15/15 (desktop + 390px)
  - test-v3-task-approval-hardening: 40/40
  - test-v3-no-self-approval: 5/5
  - test-v3-review-flow: 38/38
  - test-yc37-approval-flow: 25/25
  - test-v3-yc09-per-person: 42/42
  - test-v3-e2e-flow: 40/40
  - test-yc38-submit-approval: 36/36
  - test-yc38-locked-task: 15/15
UI_EVIDENCE: docs/evidence/phase2/*.png
MIGRATION_EVIDENCE: docs/evidence/phase2/MIGRATION_REHEARSAL_2026-10-23.{md,json}
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: YES — chờ S0 review/merge
```

> Ghi chú: commit docs này được tạo sau khi viết handoff; SHA thực tế của chính nó sẽ hiện trong
> `git log` của branch (không tự tham chiếu được trong nội dung file).

## 1. Phạm vi đã triển khai

### 1.1. Dữ liệu (additive)

- `approval_decisions.quality_percent INTEGER NULL` — không default, không backfill;
  `NULL` = “chưa đánh giá”.
- Bảng `approval_quality_adjustments`:
  - `case_id`, `decision_id`, `revision`, `old_quality_percent`, `new_quality_percent`,
    `reason`, `requested_by_id`, `requested_by_account_id`, `requested_at`,
    `status` (`PENDING|APPROVED|REJECTED`), `decided_by_id`, `decided_by_account_id`,
    `decided_at`, `decision_note`, timestamps.
  - Unique `(decision_id, revision)`, index theo case/status/thời gian.
  - FK case/decision (cascade), requester/decider (restrict/set null).
  - CHECK quality NULL hoặc 65–100 bước 5; status/revision hợp lệ.
- Migration `20261023180000_v3_approval_quality` — **không** sửa migration cũ.
- Không đổi `tasks`, `personal_work_items`, `monthly_work_results`, `product_items`,
  `work_item_products`, `evaluation_assessments`, `approval_cases` (chỉ thêm relation).

### 1.2. Domain/service — `src/server/approval-quality.ts`

- Tập giá trị hợp lệ: `65,70,75,80,85,90,95,100`.
- `AGREE + TASK_RESULT` (flag bật) bắt buộc quality; thiếu/sai → **422 trước mọi mutation**.
- `REJECT/CLARIFY` không bắt buộc; nếu gửi thì validate và lưu vào decision/history.
- `AGREE 65` vẫn là AGREE, Task `COMPLETED`; không tự reject/không đổi điểm.
- Quality hiệu lực = quality của lượt `AGREE` cuối + adjustment `APPROVED` mới nhất;
  **không update đè** `approval_decisions.quality_percent`.
- Adjustment A1:
  - Yêu cầu có `old/new/reason`; chỉ owner/submitter/tuyến duyệt được gửi.
  - Chỉ người có thẩm quyền quyết định hồ sơ được duyệt; **không tự duyệt** yêu cầu của mình.
  - Re-check effective quality khi duyệt để tránh old/new lệch; lưu audit đầy đủ.
- Feature flag server-side `V3_YC10_QUALITY` — **mặc định TẮT**.
  - Tắt: giữ nguyên hành vi cũ; thiếu quality **không** 422; quality không lưu/hiển thị;
    adjustment bị chặn 409.
- Visibility E10.6: owner + submitter + decider + tuyến duyệt; `SYSTEM_ADMIN` và collaborator
  không mặc nhiên thấy quality (API trả `visible=false`, không trả giá trị/lịch sử).

### 1.3. API

- `POST /api/approvals/[caseType]/[id]/decision` nhận `qualityPercent?`, validate trước,
  lưu cùng transaction với decision/status.
- `GET /api/approvals/[caseType]/[id]/preview` trả `quality`:
  `visible/enabled/required/original/effective/adjusted/history/adjustments/canRequestAdjustment`.
- `POST /api/approvals/[caseType]/[id]/quality-adjustments` — tạo yêu cầu điều chỉnh.
- `POST /api/approvals/quality-adjustments/[id]/decision` — duyệt/từ chối (`APPROVE|REJECT`).
- `GET /api/tasks/[id]` trả `approval.quality` theo quyền + `qualityEnabled`;
  `PATCH /api/tasks/[id]` và `PATCH /api/tasks` nhận `qualityPercent` để không có đường ghi tắt.

### 1.4. UI

- `ApprovalPreviewModal`:
  - Select 65–100 bước 5 khi `AGREE + TASK_RESULT`; **không tự mặc định 100**.
  - Chặn client + báo lỗi rõ khi thiếu quality; server vẫn là chốt cuối (422).
  - Hiển thị quality gốc/hiệu lực, lịch sử theo vòng, danh sách adjustment.
  - Form gửi yêu cầu điều chỉnh; nút duyệt/từ chối chỉ hiện với người đủ thẩm quyền
    và không phải người yêu cầu.
- `tasks/[id]`: panel “Đánh giá chất lượng kết quả” + lịch sử + form adjustment;
  modal duyệt nhanh có select quality khi flag bật.
- Collaborator không thấy panel/giá trị quality.
- Responsive desktop + 390px (không tràn ngang).

### 1.5. Export

- Thêm sheet phụ **“Đánh giá chất lượng”** sau các sheet chính thức.
- Cột: STT, mã/tên nhiệm vụ, vòng, quality gốc, quality hiệu lực, điều chỉnh, lý do,
  người đánh giá, thời điểm; NULL hiển thị “Chưa đánh giá”.
- Không sửa bất kỳ ô/cột nào của 01A/01B/02A/02B hoặc Bảng 1 (test so sánh cell-by-cell).
- Chỉ lấy Task thuộc sở hữu của người được xuất (tránh collaborator thấy quality qua export).

## 2. Migration rehearsal

- DB: `talung_v3_approval_impl_quality` (local).
- Apply → rollback → re-apply: PASS.
- Rollback giữ nguyên 10 `approval_decisions` cũ (quality NULL), không mất dữ liệu.
- Chi tiết + JSON: `docs/evidence/phase2/MIGRATION_REHEARSAL_2026-10-23.md` / `.json`.
- Rollback SQL: `scripts/sql/v3_approval_quality_rollback.sql`.
- DB clone không có `_prisma_migrations`; migration áp bằng `prisma db execute` (không `migrate deploy`).
- **Không chạy trên Production, không chạy trên fixture_integration.**

## 3. Test & bằng chứng

### 3.1. YC-10 (flag bật)

`npx tsx scripts/test-v3-yc10-quality.ts` → **107 PASS / 0 FAIL**.

Bao phủ:
- 65..100 accepted; 60/64/66/72/99/101/65.5/chuỗi → 422, không tạo case/không đổi Task.
- AGREE thiếu quality → 422, Task vẫn `WAITING_REVIEW`.
- AGREE 65 → Task `COMPLETED`, quality 65.
- REJECT/CLARIFY không quality → OK; có quality hợp lệ → lưu; quality sai → 422.
- Lịch sử theo vòng (CLARIFY 70 → response → AGREE 85).
- Adjustment: thiếu lý do/sai giá trị/trùng/không quyền → 422/403; pending; leader khác duyệt;
  self-approve 403; reject giữ effective; audit old/new/reason; decision gốc bất biến.
- Visibility: owner/leader thấy; collaborator ẩn; SYSTEM_ADMIN 403.
- DB CHECK từ chối 60/72; FK/unique/index đúng.
- Export: sheet phụ đúng; official sheet **không đổi cell-by-cell**.
- Không tăng `ProductItem`, `WorkItemProduct`, `EvaluationAssessment`, `MonthlyWorkResult`.
- Flag off (service-level): AGREE thiếu quality vẫn thành công, quality NULL, adjustment 409.

### 3.2. UI (flag bật)

`npx tsx scripts/test-yc10-ui.ts` → **15 PASS / 0 FAIL**.

- Desktop: modal required → chọn 65; task detail quality/history/adjustment form.
- Mobile 390px: select + task panel, `scrollWidth = clientWidth = 390`.
- Collaborator: không có panel quality, không thấy “Hiệu lực: 80%”.

Ảnh: `docs/evidence/phase2/01..07-*.png`.

### 3.3. Regression bắt buộc

Chạy với `V3_YC10_QUALITY=false` (đúng chế độ legacy mặc định) vì các bộ này không gửi
`qualityPercent` và kiểm tra hành vi cũ. Không sửa/xóa test nào.

| Bộ test | Kết quả |
|---|---|
| test-v3-task-approval-hardening | 40/40 |
| test-v3-no-self-approval | 5/5 |
| test-v3-review-flow | 38/38 |
| test-yc37-approval-flow | 25/25 |
| test-v3-yc09-per-person | 42/42 |
| test-v3-e2e-flow | 40/40 |
| test-yc38-submit-approval | 36/36 |
| test-yc38-locked-task | 15/15 |

Log: `docs/evidence/phase2/logs/*.log`.

- `test-yc37-approval-flow` gọi service trực tiếp nên cần đặt **cả** `DATABASE_URL` và
  `DIRECT_URL` về DB quality; đã chạy lại 25/25.
- Các bộ regression khác chạy HTTP qua server port 3117.

## 4. Điều **KHÔNG** làm

- **KHÔNG** merge `integration`/`main`, **KHÔNG** deploy, **KHÔNG** ghi Production.
- **KHÔNG** đổi QĐ1277, `MonthlyWorkResult`, `scoring`, `ProductItem`, `WorkItemProduct`,
  `EvaluationAssessment`, `finalGrade`, Bảng 1.
- **KHÔNG** thêm role/stage/team/permission mới; không seed `person_supervisions`;
  không tạo `tasks.precheck` hay `approvals.quality.adjust` (P-3).
- **KHÔNG** làm Q2 per-person (E10.7); quality vẫn là Q1 trên kết quả Task.
- **KHÔNG** đặt ngưỡng tối thiểu (65–70 vẫn AGREE hợp lệ theo E10.3).
- **KHÔNG** sửa test expectation / không xóa test.
- **KHÔNG** chạy `prisma migrate deploy`.

## 5. Việc còn lại / rủi ro

1. **S0 review & merge** theo thứ tự migration: Phase 1 `20261023170000` → Phase 2
   `20261023180000`. Branch này dựa trên integration đã có Phase 1.
2. **Feature flag:** production phải để `V3_YC10_QUALITY` TẮT cho đến khi S0/UAT chốt bật.
   Khi bật, mọi luồng AGREE TASK_RESULT phải gửi quality; các shortcut cũ (vd. “Duyệt hoàn thành”
   ở My Work) sẽ nhận 422 với thông báo rõ và cần dùng modal Phê duyệt. Đây là hành vi có chủ đích
   của M1, không phải bypass.
3. **Adjustment UI** nằm trong modal duyệt/task detail, chưa có trang hàng đợi riêng cho yêu cầu
   điều chỉnh. Nếu S0 muốn quy trình riêng phải chốt bổ sung.
4. **DB test clone** không có lịch sử `_prisma_migrations`; release thật cần rehearsal theo S1/S0.
5. **UAT người dùng thật** chưa chạy; mới test fixture/role giả lập.
6. Chưa xử lý quality cho PLAN/DEADLINE (đúng phạm vi YC-10: chỉ TASK_RESULT).

## 6. Lệnh chạy lại

```powershell
# DB test local
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_approval_impl_quality"
$env:DIRECT_URL=$env:DATABASE_URL
$env:TEST_BASE_URL="http://localhost:3117"
$env:TEST_PASSWORD="LocalTest@2026"

npx tsc --noEmit
npx prisma validate
pnpm build

# Server cho test YC-10 phải chạy với flag bật:
# $env:V3_YC10_QUALITY="true"; pnpm dev -- -p 3117
npx tsx scripts/test-v3-yc10-quality.ts
npx tsx scripts/test-yc10-ui.ts

# Regression: chạy server với $env:V3_YC10_QUALITY="false"
npx tsx scripts/test-v3-task-approval-hardening.ts
npx tsx scripts/test-v3-no-self-approval.ts
npx tsx scripts/test-v3-review-flow.ts
npx tsx scripts/test-yc37-approval-flow.ts
npx tsx scripts/test-v3-yc09-per-person.ts
npx tsx scripts/test-v3-e2e-flow.ts
npx tsx scripts/test-yc38-submit-approval.ts
npx tsx scripts/test-yc38-locked-task.ts
```
