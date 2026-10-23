# S3 — HANDOFF `WAIT_B_C_2` (YC-06 / YC-07)

- **Session:** S3 — Phase C
- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`
- **Branch:** `codex/v3-phase-c-metrics`
- **Base:** `50daed3` (docs) / `a68d31e` (code baseline)
- **Database test:** `talung_v3_phase_c` (localhost)
- **Port:** 3113
- **Trạng thái:** `WAIT_B_C_2` — helper/test/UI mock đã merge; **chưa sửa** schema/API/`metrics.ts`/`/giao-ban`
- **Ngày:** 23/10/2026

---

## 1. Đã đọc / căn cứ

- `D:\thanhnx\OpenCode\talung-integration\docs\V3\S0_DECISION_LOG_2026-10-23.md`
- `D:\thanhnx\OpenCode\talung-integration\docs\V3\S2_CONTRACT_ALIGNMENT_BLOCKER_2026-10-23.md`
- `docs/evidence/multi-session/S3/S3_HANDOFF_APPROVED_2026-10-23.md`
- `D:\thanhnx\OpenCode\talung-phase-b\docs\V3\DATA_CONTRACT_B_C_2026-10-23.md` (B-C-1)

---

## 2. Việc đã làm trong đợt này

1. **Kế hoạch target-only:** `docs/evidence/multi-session/S3/S3_TARGET_ONLY_IMPLEMENTATION_PLAN_2026-10-23.md`.
2. **Bổ sung test cho Q9/Q11** (không sửa API/schema):
   - `dataSource=DEMO` thắng `isOfficial=true` → không chính thức.
   - `dataSource=REAL` thắng `isOfficial=false` → chính thức.
   - `resolveOfficialFlag` cho cả hai nguồn.
   - `%` 2 chữ số half-up: 78,18 / 109,67 / 77,50; 0 thực = 0,00%.
3. Test hiện tại: **108/108 PASS**.
4. Không sửa: `prisma/schema.prisma`, migration, `src/server/metrics.ts`, `/api/metrics/*`, `/giao-ban`, `/giao-ban/cau-hinh`.

---

## 3. Blocker / dependency B-C-2

S2 đang sửa Q9/Q11, **chưa công bố B-C-2**. S3 cần:

| Mã | Điều kiện |
|---|---|
| D1 | `dataSource`/`isOfficial` + backfill; API trả cờ (Q9) |
| D2 | `%` 2 chữ số half-up (Q11) |
| D3 | Map `PROPOSED` (B-C-1) ↔ `DRAFT` (S3 Q2) |
| D4 | `comparisonKind` → `labelCode`; không dùng regex nhãn |
| D5 | `direction`, `measureMode`, `baselineScope` |
| D6 | `metrics.config` / `metrics.entry_all` + assignment; không `giao_ban.target.*` |
| D7 | Chốt API target-only (route mới của S3 hay target CRUD trong admin của S2) |
| D8 | Revision/audit old/new/status/source |
| D9 | B-C-2 published + migration rehearsal + S0 merge |

Chi tiết: `S3_TARGET_ONLY_IMPLEMENTATION_PLAN_2026-10-23.md` §1.

---

## 4. Kế hoạch file sau khi S2 merge

**S3 dự kiến thêm/sửa:**

- `src/lib/metrics-contract.ts` — mapping B-C-2 (`dataSource`→`isOfficial`, `PROPOSED`↔`DRAFT`, `comparisonKind`→`labelCode`).
- `src/server/metric-targets.ts` — service target-only (nếu D7=A).
- `src/app/api/metrics/targets/route.ts`, `[id]/route.ts` — API target-only (nếu D7=A).
- `src/components/metrics/MetricTargetDraftEditor.tsx` — bỏ mock, nối API.
- `src/app/giao-ban/cau-hinh/page.tsx` — **chỉ tab target**.
- `src/app/giao-ban/page.tsx` — **chỉ hiển thị target/%/trạng thái**.
- `scripts/test-phase-c-target-api.ts`, `scripts/test-phase-c-target-ui.ts` — test DB/UI.
- `scripts/test-phase-c-contract.ts` — đã bổ sung, hiện 108/108.

**Không sửa:** schema/migration, `src/server/metrics.ts`, `/api/metrics/admin`, `/api/metrics/summary`, `/api/metrics/entries`, Dashboard.

---

## 5. Quyền

- Target config: **`metrics.config`**.
- Nhập liệu: **`metrics.entry_all`** hoặc assignment `canEnter`.
- Xác nhận số liệu: assignment `canConfirm`.
- **Không** dùng `system.config`; **không** thêm `giao_ban.target.*`.
- `SYSTEM_ADMIN` chỉ có quyền nếu được cấp tường minh `metrics.config`.

---

## 6. Báo cáo theo mẫu master plan mục 7

```text
SESSION: S3
YC: YC-06 / YC-07
BRANCH: codex/v3-phase-c-metrics
BASE_SHA: 50daed3 (docs) / a68d31e (code)
COMMIT_SHA: (cập nhật sau commit)
FILES_CHANGED:
  - docs/evidence/multi-session/S3/S3_TARGET_ONLY_IMPLEMENTATION_PLAN_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_HANDOFF_B_C_2_WAIT_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_CATALOG_REVIEW_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_CONTRACT_QUESTIONS_TO_S0_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_HANDOFF_APPROVED_2026-10-23.md
  - src/lib/metrics-contract.ts (bổ sung dataSource/resolveOfficialFlag)
  - scripts/test-phase-c-contract.ts (108/108)
SCHEMA_OR_MIGRATION: NONE
TESTS_PASS:
  - scripts/test-phase-c-contract.ts: 108/108 PASS
  - npx tsc --noEmit: PASS
  - npx prisma validate: PASS
  - pnpm build: PASS (98 trang; warning sẵn có)
TESTS_NOT_RUN:
  - test-phase-c-target-api.ts / target-ui.ts: chưa có B-C-2, chưa nối API/UI.
  - test-yc26-29-api/ui: chưa chạy lại; không có thay đổi API/UI shared.
UI_EVIDENCE:
  - SSR smoke component mock: PASS (G1–G7); chưa có browser screenshot vì chưa nối route.
SECURITY_CHECKS:
  - Không sửa auth/permission/audit/Storage.
  - Không dùng Production; DB test read-only cho phần rà soát.
  - Không dùng DEMO làm số chính thức.
DECISIONS_PENDING:
  - Q9/Q11 B-C-2; D3/D4/D5 alignment; C1; Q6 5 mã pending.
CONFLICT_EXPECTED:
  - src/server/metrics.ts, /api/metrics/*, prisma/schema.prisma, /giao-ban/*
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: NO — WAIT_B_C_2
```

---

## 7. Đề nghị S0

1. Xác nhận B-C-2 phải xử lý thêm **D3/D4/D5**, không chỉ Q9/Q11.
2. Chốt **D7**: API target-only route mới của S3 hay target CRUD trong `/api/metrics/admin` của S2.
3. Xác nhận `metrics.config`/`metrics.entry_all` sẽ được S2 seed trong B-C-2.
4. Sau khi S2 merge, S3 rebase và triển khai theo plan; không merge `main`, không deploy, không ghi Production.

---

## 8. Trạng thái

```text
SESSION: S3
STATUS: WAIT_B_C_2
IMPLEMENTED: helper/state model + test 108/108 + target UI mock
BLOCKED: target API/UI thật; schema/API/metrics.ts/giao-ban
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: NO
```
