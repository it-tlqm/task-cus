# S3 — HANDOFF `TARGET-ONLY IMPLEMENTED` (YC-06 / YC-07)

- **Session:** S3 — Phase C
- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`
- **Branch:** `codex/v3-phase-c-metrics`
- **Merge nền:** `75e5fae` (integration: S2 B-C-2 + S4/S5) → merge `--no-ff` vào nhánh S3
- **Database test:** `talung_v3_phase_c` (localhost)
- **Port:** 3113
- **Trạng thái:** `MERGED — target-only` (S0 merge `f46bd01`; integration head `959c8c3`)
- **D5:** `DEFERRED_B_C_3` — **không tính % chính thức**
- **Ngày:** 23/10/2026

> **S0 review 23/10/2026:** đã merge `7a25b6a` vào integration `f46bd01`. S0 rerun contract 110/110, mapping 80/80, target API 26/26, target UI 18/18, tsc/build PASS; S2 UI 17/17 sau khi cập nhật target tab. Không có schema/migration mới.

---

## 1. Phạm vi đã triển khai

Đúng D7=A:

- `src/server/metric-targets.ts` — service target-only.
- `/api/metrics/targets` — list/create.
- `/api/metrics/targets/[id]` — get/update/confirm/lock/void.
- `/api/metrics/targets/[id]/revisions` — lịch sử.
- `MetricTargetDraftEditor` + `MetricTargetManager` — nối API target-only.
- `/giao-ban/cau-hinh` — **chỉ tab target** thay bằng manager target-only.
- `/giao-ban` — **chỉ phần hiển thị target/trạng thái**; D5 chưa có % nên hiển thị “% chờ B-C-3”.
- Không sửa `prisma/schema.prisma`, migration, `src/server/metrics.ts`, `/api/metrics/admin`, `/api/metrics/summary`, `/api/metrics/entries`, Dashboard.
- Không thêm `giao_ban.target.*`; dùng `metrics.config` / `metrics.entry_all`.

### 1.1. API target-only

```http
GET  /api/metrics/targets?metricId=&year=&periodType=&periodNo=
POST /api/metrics/targets
GET  /api/metrics/targets/{id}
PATCH /api/metrics/targets/{id}
POST /api/metrics/targets/{id}   { action: "confirm" | "lock" | "void", ... }
DELETE /api/metrics/targets/{id}
GET  /api/metrics/targets/{id}/revisions
```

- Status B-C-2: `PROPOSED → CONFIRMED → LOCKED`; void chỉ xóa `PROPOSED` và giữ revision `DELETE`.
- `dataSource=REAL|DEMO`; `isOfficial = dataSource === "REAL"`.
- `comparisonKind`: `NONE/BTC_YEAR/UBND_YEAR/MONTH_PLAN`; không regex nhãn.
- `sourceNote` bắt buộc khi confirm; revision + audit old/new.
- Mọi write cần `metrics.config`; `metrics.entry_all` không dùng để cấu hình target.
- Response target có `rules.officialPercentAllowed=false`, `direction=NOT_SET`, `measureMode/baselineScope=PENDING_BUSINESS_INPUT`, `pending=DEFERRED_B_C_3`.

### 1.2. UI

- `MetricTargetManager`: fetch/list theo metric, tạo/sửa/xác nhận/chốt/hủy/lịch sử.
- `MetricTargetDraftEditor`: form DRAFT/PROPOSED, source bắt buộc khi confirm, badge DEMO/official, bảng target, lịch sử.
- D5 hiển thị rõ “chưa có quy tắc”; không preview %, không tô đạt/vượt.
- `/giao-ban` target chip: `label · value · trạng thái · % chờ B-C-3`; không hiển thị % chính thức.

---

## 2. Kết quả test

| Bộ test | Kết quả |
|---|---|
| `scripts/test-phase-c-contract.ts` | **110/110 PASS** |
| `scripts/test-phase-c-bc2-mapping.ts` | **80/80 PASS** |
| `scripts/test-phase-c-target-api.ts` (DB service) | **26/26 PASS**, cleanup 5 target test |
| `scripts/test-phase-c-target-ui.ts` (Puppeteer) | **18/18 PASS** |
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `pnpm build` | PASS (98 trang; warning sẵn có) |

UI evidence:

- `docs/evidence/multi-session/S3/target-only/01-cau-hinh-target.png`
- `docs/evidence/multi-session/S3/target-only/02-target-history.png`
- `docs/evidence/multi-session/S3/target-only/03-giao-ban-target.png`
- `docs/evidence/multi-session/S3/target-only/04-mobile-target.png`

DB test đã tạo rồi dọn target/revision/audit test; không đụng target DEMO gốc. Đã khôi phục mật khẩu tài khoản test sau khi chạy UI.

> Lưu ý môi trường: DB `talung_v3_phase_c` không có lịch sử `_prisma_migrations` (được tạo bằng `db push` trước đây), nên B-C-2 migration được áp dụng **thủ công bằng `prisma db execute`** trên DB test local, không chạy `migrate deploy` toàn bộ và không chạy Production. Cần S0/S2 xác nhận cách migration khi tích hợp.

---

## 3. Báo cáo theo mẫu master plan mục 7

```text
SESSION: S3
YC: YC-06 / YC-07
BRANCH: codex/v3-phase-c-metrics
BASE_SHA: 75e5fae (integration merge)
COMMIT_SHA: 45fc14f (service/API) + 98e09cb (UI) + ebb2269 (tests) + 19f5d3a (NONE→KHAC) + cb08b43/e2f7ccd (docs) + 7c61818 (final UI)
FILES_CHANGED:
  - src/server/metric-targets.ts
  - src/app/api/metrics/targets/route.ts
  - src/app/api/metrics/targets/[id]/route.ts
  - src/app/api/metrics/targets/[id]/revisions/route.ts
  - src/components/metrics/MetricTargetManager.tsx
  - src/components/metrics/MetricTargetDraftEditor.tsx
  - src/app/giao-ban/cau-hinh/page.tsx (chỉ tab target)
  - src/app/giao-ban/page.tsx (chỉ target/%/trạng thái)
  - src/lib/metrics-contract.ts
  - src/lib/metrics-bc2-mapping.ts
  - scripts/test-phase-c-contract.ts
  - scripts/test-phase-c-bc2-mapping.ts
  - scripts/test-phase-c-target-api.ts
  - scripts/test-phase-c-target-ui.ts
SCHEMA_OR_MIGRATION: NONE (chỉ áp dụng migration B-C-2 của S2 lên DB test local)
TESTS_PASS:
  - contract: 110/110
  - mapping: 80/80
  - target-api DB: 26/26
  - target-ui Puppeteer: 18/18
  - tsc/prisma validate/build: PASS
TESTS_NOT_RUN:
  - test-yc26-29-api/ui và test S2 UI cũ: chưa chạy; UI target tab đã đổi selector/nội dung.
  - Regression toàn integration: S0 chạy sau merge.
UI_EVIDENCE: docs/evidence/multi-session/S3/target-only/*.png
SECURITY_CHECKS:
  - Target write yêu cầu metrics.config; không system.config.
  - STAFF không metrics.config → 403 (service test).
  - Không dùng Production; DB test local.
  - Không đụng auth/Storage.
DECISIONS_PENDING:
  - D5/B-C-3: direction/measureMode/baselineScope; chưa tính % chính thức.
  - C1: danh sách chỉ tiêu giao/chu kỳ/chiều.
  - Q6: 5 mã lũy kế/số dư.
CONFLICT_EXPECTED:
  - /giao-ban/cau-hinh target tab và /giao-ban target display đã thay; S2 UI test cũ cần cập nhật selector.
  - S2 summary vẫn trả percent; S3 cố ý không hiển thị % chính thức trên /giao-ban cho tới B-C-3.
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: YES — target-only; D5 vẫn pending
```

---

## 4. Đề nghị S0 review

1. Review diff target-only; xác nhận không có thay đổi ngoài phạm vi.
2. Chấp nhận việc `/giao-ban` **không hiển thị %** target cho tới B-C-3 (D5).
3. Cập nhật/đánh dấu lại S2 UI test target tab nếu chạy regression.
4. Chốt cách migration B-C-2 khi merge integration (DB test hiện không có lịch sử migration).
5. Không merge `main`, không deploy Production.
