# V3.2 METRICS — HANDOFF (S2/S3)

- **Session:** S2/S3 — V3.2 metrics/targets
- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`
- **Branch:** `codex/v3.2-metrics`
- **Base:** `a721fe7` (tag `v3.1-production-2026-10-24`)
- **Commits:** `43b7b30` (D5/C1/B1) · `0ba1e21` (B2) · `9dcfec3` (tests/evidence)
- **Date:** 24/10/2026
- **Production touched:** **NO**
- **Merge/deploy:** **NO** (không merge integration/main, không Vercel/Supabase)

---

## 1. Quyết định đã triển khai

### D5-A — Target evaluation semantics tường minh

Đã thêm bảng `metric_target_rules` (migration `20261023200000_v32_metrics_decisions`) với:

- `direction`: `HIGHER_IS_BETTER | LOWER_IS_BETTER | NEUTRAL | NOT_SET`
- `measure_mode`: `PERIOD_FLOW | CUMULATIVE | SNAPSHOT | DERIVED | PENDING_BUSINESS_INPUT`
- `baseline_scope`: `YEAR_START | MONTH_START | PERIOD_START | PENDING_BUSINESS_INPUT`
- `target_applicable`: chỉ `true` khi nghiệp vụ đã duyệt gán chỉ tiêu cho metric + kỳ.
- Unique `(metric_id, period_type)`; CHECK constraints cho các enum.

Dữ liệu quyết định trong migration:

| Metric | Kỳ | Applicable | Direction | MeasureMode | BaselineScope |
|---|---|---|---|---|---|
| `THU_NSNN` | YEAR | true | `HIGHER_IS_BETTER` | `CUMULATIVE` | `YEAR_START` |
| `THU_NSNN` | MONTH | true | `HIGHER_IS_BETTER` | `CUMULATIVE` | `MONTH_START` |
| `PHI_LK_THU`, `PHI_CON`, `XOA_NO`, `NO_THUE`, `TV_CHO` | YEAR/QUARTER/MONTH | false | `NOT_SET` | `PENDING_BUSINESS_INPUT` | `PENDING_BUSINESS_INPUT` |

- Không suy từ `valueKind`/tên; metric không có dòng = `UNCONFIGURED` (`NOT_SET`/`PENDING`).
- `THU_NSNN` QUARTER không có dòng → chưa có quy tắc, không được gán target quý.
- `computeMetricSummary` chỉ trả `percent` chính thức khi rule đã duyệt + target REAL CONFIRMED/LOCKED + actual có dữ liệu.
- Target chưa đủ quy tắc trả `percentState=NOT_COMPUTED` + `percentReason` (`TARGET_RULE_NOT_APPROVED` / `DIRECTION_PENDING` / `TARGET_RULE_PENDING` / `BUSINESS_RULE_PENDING`...), không tô xanh/đỏ.
- `/giao-ban` hiển thị % đã tính; trường hợp chưa đủ quy tắc hiển thị lý do, không tô đạt/vượt.

### B1-A — So tháng trước/cùng kỳ cùng số ngày

- `computeMetricComparison` xác định data cutoff = ngày có bản ghi mới nhất trong kỳ hiện tại.
- Tháng trước và cùng kỳ năm trước lấy đúng `dayCount = min(cutoffDay, số ngày tháng đối chiếu)`.
- `ComparisonDiffBlock` mới: `basis=SAME_DAYS_TO_CUTOFF`, `cutoffDate`, `dayCount`, `periodComplete`, `ruleState` (`SAME_DAYS | INCOMPLETE_PERIOD | NO_DATA`), `percent`, `percentText`, `note`.
- Tháng chưa đủ kỳ → `INCOMPLETE_PERIOD`, UI ghi **“Chưa đủ kỳ”**.
- Thiếu dữ liệu/mẫu số 0 → `percent=null`, UI “Chưa xác định”; không tự hiện 0%.
- `RevenueComparisonSection` dùng chung Dashboard + `/giao-ban`; badge đổi thành “SO CÙNG SỐ NGÀY (B1-A)”.

### B2-A — Nhập bổ sung/điều chỉnh lũy kế

- Hiểu theo master plan B2: **“nhập bổ sung lũy kế”** = điều chỉnh `MetricBaseline` (mốc lũy kế), không phải bản ghi ngày.
- Dùng lại quyền hiện có:
  - `canEnter`: tạo/sửa mốc `PROPOSED`.
  - `canConfirm`: xác nhận mốc.
  - `metrics.entry_all`: mọi chỉ tiêu; `metrics.config`: quản trị đầy đủ.
  - **Không thêm permission mới.**
- Mọi create/update/confirm bắt buộc `reason`; ghi `metric_baseline_revisions` old/new + audit `METRIC_BASELINE_ADJUSTMENT_CREATED/UPDATED/CONFIRMED` old/new.
- Mốc `LOCKED` không sửa trực tiếp; sửa mốc `CONFIRMED` cần `canConfirm` và quay về `PROPOSED`.
- API mới: `GET/POST /api/metrics/baseline-adjustments`, `PATCH/POST /api/metrics/baseline-adjustments/[id]`.
- UI: panel **“Điều chỉnh lũy kế (B2-A)”** tại `/giao-ban/nhap`; form Cấu hình → Mốc lũy kế bổ sung trường lý do bắt buộc.
- API admin cũ (`/api/metrics/admin`, entity `baseline`) cũng bắt buộc lý do + audit old/new.

### C1-A — Target applicability

- Bảng `metric_target_rules` là nguồn duy nhất; hiện chỉ `THU_NSNN` (YEAR/MONTH) được gán chỉ tiêu.
- Chặn tạo/sửa target ở cả `src/server/metric-targets.ts` và `/api/metrics/admin` nếu metric/kỳ chưa duyệt.
- Không auto-gán target cho 49 chỉ tiêu; 49 target DEMO cũ giữ nguyên lịch sử, không bị xóa.
- `/giao-ban` hiển thị **“Chưa có quy tắc gán chỉ tiêu”** cho metric chưa duyệt.
- UI target tab hiển thị quy tắc D5-A theo metric/kỳ; direction không cho sửa tay.

---

## 2. Migration & dữ liệu local

- Migration: `prisma/migrations/20261023200000_v32_metrics_decisions/migration.sql`
- Rollback: `scripts/sql/v32_metrics_decisions_rollback.sql`
- Rehearsal: `scripts/rehearse-v32-metrics-migration.ts`
- Evidence: `docs/evidence/multi-session/V32_METRICS_MIGRATION_REHEARSAL_2026-10-24.json`

Kết quả rehearsal trên `talung_v3_fixture_integration`:

- Trước: 49 metric / 636 entry / 49 target / 47 baseline / 17 rule.
- Rollback: bảng `metric_target_rules` biến mất; 49/636/49/47/0 revision **không đổi**.
- Apply lại: 17 rule; THU_NSNN YEAR `HIGHER/CUMULATIVE/YEAR_START`, MONTH `HIGHER/CUMULATIVE/MONTH_START`; 15 rule pending cho 5 mã; dữ liệu nghiệp vụ không đổi.
- `pass=true`, `productionTouched=false`.

Đã áp dụng migration **local** vào `talung_v3_fixture_integration`, `talung_v3_phase_c`, `talung_v3_phase_b` bằng `prisma db execute` (các DB test này không có lịch sử `_prisma_migrations` đầy đủ).

### Schema mismatch

`talung_v3_phase_c` (và `talung_v3_phase_b`) thiếu các bảng/cột approval `20261023170000`–`20261023190000`; `prisma migrate diff` xác nhận. Vì vậy test DB/service/UI chính dùng **`talung_v3_fixture_integration` / port 3118** (schema hiện hành). S2 regression vẫn chạy đúng guard `talung_v3_phase_b` / 3112 sau khi áp migration local.

---

## 3. Test results

| Bộ test | Kết quả |
|---|---|
| `scripts/test-phase-c-contract.ts` | **125/125 PASS** |
| `scripts/test-phase-c-bc2-mapping.ts` | **80/80 PASS** |
| `scripts/test-phase-c-target-api.ts` | **30/30 PASS** |
| `scripts/test-phase-c-target-ui.ts` | **18/18 PASS** (desktop + 390px) |
| `scripts/test-phase-c-v32-metrics.ts` | **37/37 PASS** |
| `scripts/test-v3-phase-b-revenue.ts` | **43/43 PASS** |
| `scripts/test-v3-phase-b-ui.ts` | **17/17 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npx prisma validate` | **PASS** |
| `pnpm build` | **PASS** (98 trang) |

Evidence: `docs/evidence/multi-session/V32_METRICS_TEST_RESULTS_2026-10-24.json`.

Các điểm test chính:

- D5 rules DB đúng cho THU_NSNN + 5 mã pending; metric không có dòng = UNCONFIGURED.
- C1 chặn target cho `XNK_TK`/`PHI_LK_THU`; THU_NSNN năm/tháng tạo + xác nhận được.
- Summary chỉ COMPUTED cho THU_NSNN; PHI_LK_THU/ XNK_TK trả `TARGET_RULE_NOT_APPROVED`/UNCONFIGURED; target DEMO null.
- B1 data cutoff 18/10/2026, `dayCount=18`, `INCOMPLETE_PERIOD`, có % khi đủ dữ liệu; cùng kỳ thiếu → `NO_DATA`, null.
- B2: thiếu lý do 400; `canEnter` tạo/sửa; thiếu `canConfirm` 403; có `canConfirm` xác nhận; revision/audit old/new; LOCKED không sửa; STAFF không phân công 403.

---

## 4. Files changed (chính)

**Schema/migration**

- `prisma/schema.prisma` — model `MetricTargetRule`
- `prisma/migrations/20261023200000_v32_metrics_decisions/migration.sql`
- `scripts/sql/v32_metrics_decisions_rollback.sql`

**Server/service**

- `src/lib/metrics-contract.ts` — `BaselineScope` mới, rule helpers, reason labels.
- `src/lib/metric-target-rules.ts`, `src/server/metric-target-rules.ts`
- `src/server/metrics.ts` — D5 gating + B1-A comparison.
- `src/server/metric-targets.ts` — rules/applicability.
- `src/server/metric-baseline-adjustments.ts`
- `src/app/api/metrics/admin/route.ts` — target applicability + baseline reason/audit.
- `src/app/api/metrics/baseline-adjustments/**`

**UI**

- `src/app/giao-ban/page.tsx`
- `src/app/giao-ban/nhap/page.tsx`
- `src/app/giao-ban/cau-hinh/page.tsx`
- `src/components/dashboard/RevenueComparisonSection.tsx`
- `src/components/metrics/MetricTargetManager.tsx`
- `src/components/metrics/MetricTargetDraftEditor.tsx`
- `src/components/metrics/MetricCumulativeAdjustmentPanel.tsx`
- `src/components/metrics/target-draft-mock.ts`

**Tests/evidence**

- `scripts/test-phase-c-contract.ts`, `test-phase-c-bc2-mapping.ts`, `test-phase-c-target-api.ts`, `test-phase-c-target-ui.ts`
- `scripts/test-phase-c-v32-metrics.ts`
- `scripts/rehearse-v32-metrics-migration.ts`
- `scripts/test-v3-phase-b-revenue.ts`, `test-v3-phase-b-ui.ts`
- `docs/evidence/multi-session/V32_*.json`
- Ảnh evidence S2/S3 được cập nhật bởi test local.

---

## 5. Giả định / điểm cần S0 review

1. **B2** được hiểu là điều chỉnh `MetricBaseline` (mốc lũy kế), theo master plan dòng B2 “nhập bổ sung lũy kế”; không tạo bảng adjustment riêng. Nếu nghiệp vụ muốn “bút toán điều chỉnh” độc lập với mốc, cần quyết định bổ sung.
2. **D5** không đổi công thức `valueOf` hiện có: THU_NSNN YEAR = mốc YEAR + phát sinh sau mốc; MONTH = phát sinh từ đầu tháng. Quy tắc `CUMULATIVE`/`YEAR_START`/`MONTH_START` dùng để **gate** % chính thức, không thay công thức.
3. **THU_NSNN QUARTER** chưa có quy tắc (không nằm trong quyết định) → không được gán target quý.
4. **BaselineScope** dùng đúng 4 giá trị đã duyệt; các giá trị cũ `NONE/PERIOD/LEDGER` của mapping nội bộ đã được thay, không còn dùng trong DB.
5. Không xóa/không sửa 49 target / 47 baseline / 636 entry DEMO hiện có.

---

## 6. Lệnh chạy lại

```powershell
# DB test hiện hành (schema đầy đủ)
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_fixture_integration"
$env:DIRECT_URL=$env:DATABASE_URL

npx tsx scripts/test-phase-c-contract.ts
npx tsx scripts/test-phase-c-bc2-mapping.ts
npx tsx scripts/test-phase-c-v32-metrics.ts
npx tsx scripts/test-phase-c-target-api.ts

# Rehearsal migration (rollback -> apply)
npx tsx scripts/rehearse-v32-metrics-migration.ts

# UI (server local)
pnpm dev -- -p 3118
$env:TEST_BASE_URL="http://localhost:3118"
npx tsx scripts/test-phase-c-target-ui.ts

# S2 regression (phase_b / 3112)
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_phase_b"
$env:DIRECT_URL=$env:DATABASE_URL
$env:TEST_BASE_URL="http://localhost:3112"
npx tsx scripts/test-v3-phase-b-revenue.ts
npx tsx scripts/test-v3-phase-b-ui.ts
```

**PRODUCTION_TOUCHED: NO. READY_FOR_INTEGRATION: YES — chờ S0 review/merge.**
