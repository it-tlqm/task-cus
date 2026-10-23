# S3 — HANDOFF `APPROVED` (YC-06 / YC-07)

- **Session:** S3 — Phase C
- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`
- **Branch:** `codex/v3-phase-c-metrics`
- **Base:** `50daed3` (docs) / `a68d31e` (code baseline)
- **Database:** `talung_v3_phase_c` (localhost, test)
- **Port:** 3113
- **Trạng thái:** `APPROVED` theo `D:\thanhnx\OpenCode\talung-integration\docs\V3\S0_DECISION_LOG_2026-10-23.md`
- **Ngày:** 23/10/2026

---

## 1. Quyết định đã áp dụng

S0 đã phê duyệt toàn bộ Q1–Q12. Các điểm ràng buộc:

- **Q1=A:** `TOAN_CUC` cho MVP; chưa thêm `unit_id/scopeUnitId`.
- **Q2=B:** target `DRAFT → CONFIRMED`; DRAFT chỉ tạm tính, CONFIRMED mới tính chính thức; bắt buộc nguồn + revision + audit.
- **Q3=A:** S2 sở hữu schema shared + `src/server/metrics.ts`; S3 chỉ target UI/helper/test sau khi S2 công bố schema.
- **Q4:** không tính % khi thiếu target/0/âm/thiếu thực hiện/thiếu kỳ/lệch đơn vị/chưa xác nhận/chiều chưa chốt; 0 thực + target > 0 = `0,00%`; 2 chữ số half-up.
- **Q5=B:** hai trục `recordState + coverage`, map 6 nhãn; trạng thái tính trên nguồn giá trị đang hiển thị.
- **Q6:** `measureMode`/`baselineScope` tường minh; 5 mã `PHI_LK_THU`, `PHI_CON`, `XOA_NO`, `NO_THUE`, `TV_CHO` còn `PENDING_BUSINESS_INPUT`.
- **Q7:** chưa bật “Thiếu N ngày”; hiển thị “Số ngày có bản ghi” + khoảng dữ liệu thực tế.
- **Q8:** `metrics.config` cho target, `metrics.entry_all`/assignment cho nhập liệu; không `giao_ban.target.*`, không `system.config`.
- **Q9:** API trả `isOfficial`/`dataSource`; không dùng regex `[DEMO]`.
- **Q10:** tiếp tục `PENDING_C1`; UI “Chưa có quy tắc đánh giá”.
- **Q11:** 2 chữ số thập phân, dấu `,`; không tính hiển thị `—` + lý do.
- **Q12:** `/giao-ban` trước; Dashboard/báo cáo Word sau.

---

## 2. Báo cáo theo mẫu master plan mục 7

```text
SESSION: S3
YC: YC-06 / YC-07
BRANCH: codex/v3-phase-c-metrics
BASE_SHA: 50daed3 (docs) / a68d31e (code)
COMMIT_SHA: 979cfab (helper + test + target UI mock + docs APPROVED)
FILES_CHANGED:
  - docs/evidence/multi-session/S3/S3_CATALOG_REVIEW_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_CONTRACT_QUESTIONS_TO_S0_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_HANDOFF_APPROVED_2026-10-23.md
  - docs/evidence/multi-session/S3/catalog-snapshot.json
  - docs/evidence/multi-session/S3/catalog-appendix.md
  - scripts/review-phase-c-catalog.ts
  - scripts/test-phase-c-contract.ts
  - src/lib/metrics-contract.ts
  - src/components/metrics/MetricTargetDraftEditor.tsx
  - src/components/metrics/target-draft-mock.ts
SCHEMA_OR_MIGRATION: NONE
TESTS_PASS:
  - scripts/test-phase-c-contract.ts: 108/108 PASS (pure + SSR smoke, không DB/API)
  - npx tsc --noEmit: PASS
  - npx prisma validate: PASS
  - pnpm build: PASS (98 trang; warning jose/Edge và themeColor là warning sẵn có)
TESTS_NOT_RUN:
  - test-yc26-29-api.ts / test-yc26-29-ui.ts: chưa chạy; chưa nối API/UI thật, chờ S2 schema.
UI_EVIDENCE:
  - SSR smoke render component mock: PASS (G1–G7).
  - Chưa có browser screenshot vì chưa nối route thật.
SECURITY_CHECKS:
  - Không sửa auth/permission/audit/Storage.
  - Không truy cập Production; DB test read-only cho phần rà soát.
  - Không dùng DEMO làm số chính thức.
DECISIONS_PENDING:
  - C1: danh sách chỉ tiêu giao, chu kỳ, chiều đánh giá.
  - Q6: nghĩa lũy kế/số dư của 5 mã PHI_LK_THU, PHI_CON, XOA_NO, NO_THUE, TV_CHO.
CONFLICT_EXPECTED:
  - src/server/metrics.ts (S2 owns)
  - src/app/api/metrics/* (S2 owns shared; S3 target-only sau schema)
  - src/app/giao-ban/* (chờ S2/contract)
  - prisma/schema.prisma + migration (S2 owns)
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: PARTIAL — helper + target UI mock ready; target-only chờ S2 schema
```

---

## 3. Đã triển khai trong đợt này

### 3.1. Pure helper/state model

`src/lib/metrics-contract.ts`:

- `deriveActualState`: `recordState` + `coverage` + `displayState`; xử lý ENTRY/BASELINE/DERIVED, khóa báo cáo, không phát sinh, không áp dụng.
- `deriveTargetState`: DRAFT/CONFIRMED/LOCKED/VOID/SUPERSEDED; khớp kỳ năm/quý/tháng.
- `resolveOfficialFlag`: Q9 — `dataSource=REAL/DEMO` thắng `isOfficial`; không dùng regex nhãn.
- `computePercent`: OFFICIAL/PREVIEW; chặn target thiếu/0/âm/DEMO/DRAFT, actual thiếu/partial/chưa xác nhận, lệch đơn vị, chiều chưa chốt, `PENDING_BUSINESS_INPUT`.
- `aggregateClassifications`: không coi phân loại thiếu là 0.
- `validateTargetDraft` + `canConfirmTarget` + `nextTargetStatus`: validation target, bắt buộc nguồn khi CONFIRMED, chuyển trạng thái Q2.
- `parseMetricInput` / `formatPercentVi`: nhập số vi-VN, hiển thị 2 chữ số thập phân.

### 3.2. Target UI draft mock

`src/components/metrics/MetricTargetDraftEditor.tsx` + `target-draft-mock.ts`:

- UI draft độc lập, **không gọi API/DB**.
- Có chọn metric/loại/kỳ/giá trị/nguồn/chiều C1; badge DRAFT/CONFIRMED/DEMO; preview tạm tính.
- Có validate và chặn xác nhận khi thiếu nguồn.
- Chưa nối `/giao-ban/cau-hinh` (chờ S2 schema).

### 3.3. Test

`scripts/test-phase-c-contract.ts` — **PASS 108/108**:

- A1–A18: trạng thái dữ liệu, gồm DERIVED/BASELINE/LOCKED/coverage.
- B1–B16: trạng thái target, gồm kỳ/void/superseded/DEMO/dataSource.
- C1–C31 (+C3a/C3b): tỷ lệ, zero denominator, partial, direction, preview, 2 chữ số half-up.
- D1–D5: gộp phân loại.
- E1–E17: validate target draft.
- F1–F6: chuyển trạng thái target.
- G1–G7: SSR smoke cho UI mock.
- H1–H6: nhãn hiển thị.

---

## 4. Chưa làm / còn chặn

- **Không sửa** `prisma/schema.prisma`, migration, `src/server/metrics.ts`, `/api/metrics/*`, `/giao-ban`, `/giao-ban/cau-hinh`.
- **Không tạo/sửa/xóa** target/mốc/bản ghi thật.
- **Không đổi** `requireConfirm`, `expectDaily`, `showOnDashboard`.
- **Chưa nối** helper/UI vào app.
- **C1** và **Q6** vẫn cần nghiệp vụ.

---

## 5. Bước tiếp theo

Kế hoạch target-only sau B-C-2: `S3_TARGET_ONLY_IMPLEMENTATION_PLAN_2026-10-23.md`.
Handoff trạng thái chờ: `S3_HANDOFF_B_C_2_WAIT_2026-10-23.md`.

1. S2 công bố schema/contract B-C-2 (Q9/Q11 + D3/D4/D5).
2. S3 rebase `codex/v3-phase-c-metrics` lên schema của S2.
3. S3 làm **target-only**: API target, `/giao-ban/cau-hinh`, hiển thị trạng thái/lý do trên `/giao-ban` theo phân công S0.
4. Chạy test tích hợp DB fixture + UI Desktop/Mobile; báo cáo `PRODUCTION_TOUCHED: NO`.
5. Không merge `main`, không deploy khi chưa có lệnh riêng.
