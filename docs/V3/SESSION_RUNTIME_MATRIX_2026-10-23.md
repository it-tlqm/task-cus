# S0 — SƠ ĐỒ WORKTREE / RUNTIME MULTI-SESSION

**Cập nhật:** 23/10/2026  
**Baseline code:** `a68d31e` — merge Phase A (`9534c6a`) vào `origin/main` (`4c7eb52`) trên nhánh integration.  
**Nguyên tắc:** mỗi session chỉ làm trong worktree/branch của mình; không merge `main`; không deploy; không ghi Production.

## 1. Worktree và nhánh

| Session | Worktree | Branch | Base | Port | Database test | Trạng thái |
|---|---|---|---|---|---:|---|
| S0 | `D:\thanhnx\OpenCode\talung-integration` | `codex/v3-integration-yc01-13` | `origin/main` + Phase A | 3100 | `talung_v3_integration` | Baseline ready |
| S1 | `D:\thanhnx\OpenCode\talung-phase-a-qa` | `codex/v3-phase-a-qa` | `a68d31e` | 3111 | `talung_v3_phase_a_qa` | Ready for Phase A QA |
| S2 | `D:\thanhnx\OpenCode\talung-phase-b` | `codex/v3-phase-b-revenue` | `a68d31e` | 3112 | `talung_v3_phase_b` | Ready, contract B/C pending |
| S3 | `D:\thanhnx\OpenCode\talung-phase-c` | `codex/v3-phase-c-metrics` | `a68d31e` | 3113 | `talung_v3_phase_c` | Wait for B/C contract |
| S4 | `D:\thanhnx\OpenCode\talung-task-approval` | `codex/v3-task-approval-history` | `a68d31e` | 3114 | `talung_v3_task_approval` | Ready for YC-08/hotfix YC-09/YC-12 |
| S5 | `D:\thanhnx\OpenCode\talung-roster` | `codex/v3-roster-notes` | `a68d31e` | 3115 | `talung_v3_roster` | Ready for YC-13 |
| S6 | `D:\thanhnx\OpenCode\talung-approval-spec` | `codex/v3-approval-rules-spec` | `a68d31e` | — | — | SPEC ONLY |

Ghi chú: baseline `a68d31e` là commit merge Phase A vào integration. Session branches được tạo từ baseline này trước khi bổ sung tài liệu S0; S0 sẽ fast-forward tài liệu bootstrap khi hoàn tất.

## 2. Cô lập runtime

- Mỗi worktree đã có `node_modules` riêng và Prisma Client đã generate.
- Database test được clone từ `talung_v3_fixture`; không dùng chung DB ghi dữ liệu giữa các session.
- `.env.local` mỗi worktree chỉ dùng DB test/port riêng, không chứa credential Production.
- Storage: giữ fail-closed; không mở quyền hoặc dùng bucket Production cho test.
- Không chạy `prisma migrate deploy`, seed, reset trên Production.

## 3. Phạm vi sở hữu

| Session | File/module sở hữu chính | Không được tự sửa |
|---|---|---|
| S1 | `src/app/api/plans`, `personal-work-items`, `work-item-products`, `scripts/test-v3-phase-a-*`, migration A | Approval service dùng chung; schema ngoài phạm vi A |
| S2 | `src/app/giao-ban`, dashboard NSNN, API/metric liên quan thu NSNN | Chỉ tiêu giao C khi chưa có contract |
| S3 | Metric definitions, trạng thái dữ liệu, chỉ tiêu giao | API/schema chung khi chưa có contract B/C |
| S4 | `src/server/approval-case.ts`, `task-transitions.ts`, legacy Task routes, `TaskUpdate`, `/approvals`, `/work-item-reviews` | Quality/team/stage/per-assignee model khi chưa chốt |
| S5 | `/roster`, `api/rosters`, `DutyRoster.notes`, audit roster | Trực trưa, template Excel, logic cảnh báo server |
| S6 | Tài liệu spec/decision | Không code/schema nghiệp vụ |

## 4. Thứ tự tích hợp

1. S0 baseline + Phase A (đã merge vào integration).
2. S5 / YC-13.
3. S4 / YC-08 + hotfix YC-09 + YC-12.
4. S2 / YC-01/02 sau contract B/C.
5. S3 / YC-06/07.
6. S6 chỉ chuyển implementation sau quyết định chính thức.

## 5. Điều kiện handoff

Mỗi session gửi S0 theo mẫu mục 7 của master plan, kèm:
- commit SHA, file changed, schema/migration;
- test đã chạy/chưa chạy;
- UI evidence;
- security checks;
- quyết định còn chờ;
- xác nhận `PRODUCTION_TOUCHED: NO`.

S0 không merge nếu còn P0/leo quyền/tự duyệt, test hồi quy fail chưa giải thích, schema chưa diễn tập hoặc hard-code quyết định chưa chốt.
