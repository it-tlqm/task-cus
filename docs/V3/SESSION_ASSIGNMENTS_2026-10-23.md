# S0 — PHÂN CÔNG S1 → S6

**Baseline:** `1b856f1` (integration; Phase A đã merge)  
**Quy tắc:** mỗi session chỉ làm trong worktree của mình; không merge `main`; không deploy; không ghi Production.  
**Bắt buộc đọc:** `docs/V3/MULTI_SESSION_MASTER_PLAN_YC01_YC13_2026-10-23.md`, `docs/V3/SESSION_RUNTIME_MATRIX_2026-10-23.md`, `docs/V3/REVIEW_YC08_YC13_2026-10-23.md` và tài liệu nguồn của nhóm.

---

## S1 — Phase A QA

- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-a-qa`
- **Branch:** `codex/v3-phase-a-qa`
- **Port:** 3111 — **DB:** `talung_v3_phase_a_qa`
- **Phạm vi:** QA Phase A YC-03/04/05, fixture, migration rehearsal, test còn thiếu, release readiness. Không viết lại Phase A.
- **Được sửa:** test/QA trong phạm vi A; lỗi Phase A nếu có bằng chứng; migration A.
- **Không sửa:** approval service dùng chung, quality/team/stage, schema ngoài A.
- **Gate:** 2 bộ `test-yc23-25-api.ts` và `test-v3-evidence-adjustment.ts` phải xử lý bằng fixture/storage test riêng; không hạ bảo mật.
- **Handoff:** test pass/fail, migration rehearsal, rollback, UAT, `PRODUCTION_TOUCHED: NO`.

Prompt khởi động:
```text
Bạn là S1 — Phase A QA. Làm việc chỉ trong D:\thanhnx\OpenCode\talung-phase-a-qa, branch codex/v3-phase-a-qa. Đọc đầy đủ docs/V3/MULTI_SESSION_MASTER_PLAN_YC01_YC13_2026-10-23.md, SESSION_RUNTIME_MATRIX, REVIEW_YC08_YC13 và báo cáo Phase A. Chỉ QA/fix trong phạm vi YC-03/04/05. Không merge main, không deploy, không ghi Production. Chạy test trên DB talung_v3_phase_a_qa, port 3111. Báo cáo S0 theo mẫu mục 7.
```

---

## S2 — Phase B (YC-01/02)

- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-b`
- **Branch:** `codex/v3-phase-b-revenue`
- **Port:** 3112 — **DB:** `talung_v3_phase_b`
- **Phạm vi:** Thu NSNN, nhập giá trị gốc, % tự tính, khối so sánh Dashboard/`/giao-ban`.
- **Được sửa:** module NSNN, dashboard/giao-ban phần B; API/schema sau khi chốt contract.
- **Không sửa:** chỉ tiêu giao C khi chưa có contract; không hard-code số Excel; không công bố cùng kỳ khi chưa chốt.
- **Gate:** B1/B2 còn mở; S2 là đầu mối hợp đồng dữ liệu chung với S3/S0.
- **Handoff:** contract B/C, test tái hiện 3 tỷ lệ, zero denominator, quyền/audit.

Prompt khởi động:
```text
Bạn là S2 — Phase B. Làm việc chỉ trong D:\thanhnx\OpenCode\talung-phase-b, branch codex/v3-phase-b-revenue. Đọc master plan và tài liệu YC-01/02. Chỉ implement phần đã chốt; B1/B2 ghi PENDING. Không hard-code Excel, không sửa Production. DB talung_v3_phase_b, port 3112. Gửi S0 contract B/C trước khi sửa API/schema chung.
```

---

## S3 — Phase C (YC-06/07)

- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`
- **Branch:** `codex/v3-phase-c-metrics`
- **Port:** 3113 — **DB:** `talung_v3_phase_c`
- **Phạm vi:** trạng thái dữ liệu giao ban, chỉ tiêu giao, % thực hiện.
- **Được sửa:** module metric/trạng thái/chỉ tiêu sau contract.
- **Không sửa:** API/schema dùng chung trước contract B/C; không coi thiếu = 0; không tự gắn đạt/vượt.
- **Gate:** chờ S2/S0 chốt contract.
- **Handoff:** contract đã ký, test trạng thái thiếu/không phát sinh/không áp dụng, zero denominator.

Prompt khởi động:
```text
Bạn là S3 — Phase C. Làm việc chỉ trong D:\thanhnx\OpenCode\talung-phase-c, branch codex/v3-phase-c-metrics. Đọc master plan và tài liệu YC-06/07. Chưa sửa API/schema chung cho tới khi S2/S0 chốt contract; có thể dựng phần độc lập/mocks. DB talung_v3_phase_c, port 3113. Không coi dấu trống là 0.
```

---

## S4 — Task & Approval hardening

- **Worktree:** `D:\thanhnx\OpenCode\talung-task-approval`
- **Branch:** `codex/v3-task-approval-history`
- **Port:** 3114 — **DB:** `talung_v3_task_approval`
- **Phạm vi được implement ngay:**
  - YC-08: projection approve/return, badge trạng thái, người/thời gian/ý kiến, thông báo owner + collaborator, deep link, stale UI.
  - YC-09 hotfix: không báo success khi bỏ result; collaborator không ghi đè/cancel/đổi assignee/nộp thay; whitelist status; chặn tự duyệt mọi route; sửa test `AGREED`.
  - YC-12 phần rõ: badge/action theo `reviewState`; lịch sử theo `reviewedById`/`decidedById`; filter tên/kỳ; “Đã xử lý” ở `/approvals`.
- **Không sửa:** quality, per-assignee model, team/stage, lịch sử hợp nhất toàn bộ nguồn.
- **Gate:** không để legacy path bỏ qua `ApprovalCase`; không tạo quy trình mới không cần thiết.
- **Handoff:** test mọi route, self-approval, collaborator, history, `PRODUCTION_TOUCHED: NO`.

Prompt khởi động:
```text
Bạn là S4 — Task & Approval hardening. Làm việc chỉ trong D:\thanhnx\OpenCode\talung-task-approval, branch codex/v3-task-approval-history. Đọc master plan, REVIEW_YC08_YC13. Chỉ implement YC-08, hotfix an toàn YC-09, YC-12 phần đã rõ. Không thêm quality/team/stage/per-assignee. DB talung_v3_task_approval, port 3114. Không merge main/deploy/ghi Production.
```

---

## S5 — Duty Roster

- **Worktree:** `D:\thanhnx\OpenCode\talung-roster`
- **Branch:** `codex/v3-roster-notes`
- **Port:** 3115 — **DB:** `talung_v3_roster`
- **Phạm vi:** bỏ icon `error` đỏ; giữ cảnh báo trùng/kiêm nhiệm server; thêm ghi chú per-person qua `DutyRoster.notes`; audit old/new; giữ “Đổi người” có lý do.
- **Không sửa:** trực trưa, template Excel, logic cảnh báo server, ghi chú ô trống (chờ E13).
- **Gate:** không biến xung đột thành hợp lệ chỉ vì ẩn icon; test roster/audit/export.
- **Handoff:** UI evidence, test notes/audit/đổi người/trực trưa/Excel.

Prompt khởi động:
```text
Bạn là S5 — Duty Roster. Làm việc chỉ trong D:\thanhnx\OpenCode\talung-roster, branch codex/v3-roster-notes. Đọc master plan, REVIEW_YC08_YC13. Chỉ implement YC-13 phần đã rõ: bỏ icon error, notes per-person, audit, giữ đổi người có lý do. Không đổi trực trưa/Excel/cảnh báo server. DB talung_v3_roster, port 3115. Không merge main/deploy/ghi Production.
```

---

## S6 — Business Design (SPEC ONLY)

- **Worktree:** `D:\thanhnx\OpenCode\talung-approval-spec`
- **Branch:** `codex/v3-approval-rules-spec`
- **Không DB/port.**
- **Phạm vi:** spec YC-09 per-person, YC-10 quality 65–100, YC-11 team/deputy/stage/multi-department.
- **Không code/schema/migration.**
- **Đầu ra:** phương án, ma trận quyền, migration proposal, test plan, quyết định cần chốt.
- **Handoff:** SPEC commit + danh sách câu hỏi; S0 không merge implementation.

Prompt khởi động:
```text
Bạn là S6 — Business Design. Làm việc chỉ trong D:\thanhnx\OpenCode\talung-approval-spec, branch codex/v3-approval-rules-spec. Chỉ viết spec/decision cho YC-09 per-person, YC-10 quality, YC-11 team/deputy/stage. Không code, không schema, không migration. Gửi S0 phương án và câu hỏi chốt.
```

---

## Thứ tự tích hợp

1. S5 → 2. S4 → 3. S2 → 4. S3 → 5. S6 (chỉ sau quyết định).
Mỗi lần S0 merge: typecheck/prisma validate/build + regression liên quan + cập nhật mục 13 master.
