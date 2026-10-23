# S0 — SƠ ĐỒ WORKTREE / RUNTIME MULTI-SESSION

**Cập nhật:** 23/10/2026  
**Baseline code:** `a68d31e` — merge Phase A (`9534c6a`) vào `origin/main` (`4c7eb52`) trên nhánh integration.  
**Nguyên tắc:** mỗi session chỉ làm trong worktree/branch của mình; không merge `main`; không deploy; không ghi Production.

## 1. Worktree và nhánh

| Session | Worktree | Branch | Base | Port | Database test | Trạng thái |
|---|---|---|---|---|---:|---|
| S0 | `D:\thanhnx\OpenCode\talung-integration` | `codex/v3-integration-yc01-13` | `352f078` + docs | 3100 | `talung_v3_integration` (dev) / `talung_v3_fixture_integration` (test) | **READY** — baseline + merges PASS |
| S1 | `D:\thanhnx\OpenCode\talung-phase-a-qa` | `codex/v3-phase-a-qa` | `2953aea` | 3111 | `talung_v3_phase_a_qa` | **MERGED — release readiness**; RC chưa freeze; production access blocked |
| S2 | `D:\thanhnx\OpenCode\talung-phase-b` | `codex/v3-phase-b-revenue` | `236f7fb` | 3112 | `talung_v3_phase_b` | **MERGED** — Q9/Q11 PASS; D5 deferred B-C-3 |
| S3 | `D:\thanhnx\OpenCode\talung-phase-c` | `codex/v3-phase-c-metrics` | `cb093f4` | 3113 | `talung_v3_phase_c` | **READY_TARGET_ONLY** — B-C-2 merged; D5 pending |
| S4 | `D:\thanhnx\OpenCode\talung-task-approval` | `codex/v3-task-approval-history` | `56a8d68` | 3114 | `talung_v3_task_approval` | **MERGED — STANDBY** — không code thêm |
| S5 | `D:\thanhnx\OpenCode\talung-roster` | `codex/v3-roster-notes` | `2bc645d` | 3115 | `talung_v3_roster` | **MERGED — STANDBY** — E13 PENDING |
| S6 | `D:\thanhnx\OpenCode\talung-approval-spec` | `codex/v3-approval-rules-spec` | `8242674` | — | — | **PLAN MERGED** — Phase 1 ready |
| S6-Impl | `D:\thanhnx\OpenCode\talung-approval-impl` | `codex/v3-approval-phase1` | `54d8c8c` | 3116 | `talung_v3_approval_impl` | **BRANCH CREATED** — chưa code |

Ghi chú: baseline code `a68d31e` là commit merge Phase A vào integration. Các commit `244aa49 → 50daed3 → 6cacc50` chỉ là tài liệu/start signal; S3/S6 đã tạo handoff riêng trên nhánh của mình. Không có thay đổi schema/API trong S3/S6.

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

## 5. Xác minh kết nối DB từng worktree (23/10/2026)

Đã đọc `.env`/`.env.local` cục bộ, chỉ trích xuất host/port/database (không in mật khẩu) và chạy truy vấn read-only `current_database()` + đếm `accounts`:

| Worktree | Host | DB thực tế | `.env` = `.env.local` | Kết quả |
|---|---|---|---|---|
| S0 integration | localhost:5432 | `talung_v3_integration` | Có | **SAFE_LOCAL_TEST** |
| S1 phase-a-qa | localhost:5432 | `talung_v3_phase_a_qa` | Có | **SAFE_LOCAL_TEST** |
| S2 phase-b | localhost:5432 | `talung_v3_phase_b` | Có | **SAFE_LOCAL_TEST** |
| S3 phase-c | localhost:5432 | `talung_v3_phase_c` | Có | **SAFE_LOCAL_TEST** |
| S4 task-approval | localhost:5432 | `talung_v3_task_approval` | Có | **SAFE_LOCAL_TEST** |
| S5 roster | localhost:5432 | `talung_v3_roster` | Có | **SAFE_LOCAL_TEST** |
| S6 approval-spec | — | Không cấu hình DB | — | **SPEC ONLY** |

Không có host/DB Production trong cấu hình session. Không in credential ra log.

## 6. Kết quả baseline S0

- `npx tsc --noEmit`: PASS.
- `npx prisma validate`: PASS.
- `pnpm build`: PASS (Next.js 15.5.27, 98 trang).
- `scripts/test-v3-phase-a-planning.ts`: **37/37 PASS**.
- `scripts/test-v3-no-self-approval.ts`: **5/5 PASS**.
- `scripts/test-v3-multi-product.ts`: **36/36 PASS**.
- DB test: `talung_v3_fixture_integration`; không dùng Production.
- Hai bộ Phase A vẫn chờ fixture/storage riêng: `test-yc23-25-api.ts` và `test-v3-evidence-adjustment.ts`; S1 xử lý theo gate, không hạ bảo mật.

## 7. Handoff S3/S6 đã review

| Session | HEAD | Phạm vi | Kết quả S0 | Merge? |
|---|---|---|---|---|
| S3 | `860c10a` | Helper + target UI mock + target-only plan; không schema/API | **108/108 PASS**, tsc/build PASS; **WAIT_B_C_2** | **YES — plan/helper**; target-only chờ S2 |
| S6 | `21c37ae` | Docs-only; spec + implementation/migration/test plan | **PLAN MERGED** | **YES — docs/plan**; code chờ nhánh implementation |

Quyết định đã chốt: `docs/V3/S0_DECISION_LOG_2026-10-23.md`.

## 8. Handoff batch 2 (S1/S2/S4/S5)

| Session | HEAD | Kết quả S0 | Merge |
|---|---|---|---|
| S1 | `3708672` | QA 313/313 báo cáo; S0 rerun Phase A 37/37; migration rehearsal 14/14 | **MERGED** `06c5d19` |
| S2 | `207dcfc` | 34/34 API + 14/14 UI báo cáo; contract lệch Q9/Q11 | **BLOCKED** |
| S4 | `56a8d68` | S0 rerun hardening 40/40 + no-self 5/5 | **MERGED** `5d5c299` |
| S5 | `2bc645d` | S0 rerun API 22/22 + UI 24/24 | **MERGED** `532c3f6` |

S2 blocker chi tiết: xem `docs/V3/S2_CONTRACT_ALIGNMENT_BLOCKER_2026-10-23.md` và `docs/V3/S0_DECISION_LOG_2026-10-23.md` mục 1.2.

## 9. Điều kiện handoff

Mỗi session gửi S0 theo mẫu mục 7 của master plan, kèm:
- commit SHA, file changed, schema/migration;
- test đã chạy/chưa chạy;
- UI evidence;
- security checks;
- quyết định còn chờ;
- xác nhận `PRODUCTION_TOUCHED: NO`.

S0 không merge nếu còn P0/leo quyền/tự duyệt, test hồi quy fail chưa giải thích, schema chưa diễn tập hoặc hard-code quyết định chưa chốt.
