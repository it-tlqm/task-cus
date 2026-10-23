/**
 * S3 — Phase C: test cho contract APPROVED (YC-06/07).
 *
 * - Test pure helper `src/lib/metrics-contract.ts`.
 * - SSR smoke test cho target UI draft mock.
 * - Không kết nối DB/API; không dùng Production.
 *
 * Chạy:
 *   npx tsx scripts/test-phase-c-contract.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DIRECTION_LABELS,
  DISPLAY_STATE_LABELS,
  OFFICIAL_PERCENT_POLICY,
  PERCENT_REASON_LABELS,
  TARGET_STATE_LABELS,
  aggregateClassifications,
  canConfirmTarget,
  computePercent,
  deriveActualState,
  deriveTargetState,
  formatPercentVi,
  nextTargetStatus,
  parseMetricInput,
  targetDraftErrors,
  validateTargetDraft,
  type ActualSnapshot,
  type ActualStateResult,
  type Direction,
  type MeasureMode,
  type PercentResult,
  type Period,
  type TargetDraftInput,
  type TargetSnapshot,
  type TargetStateResult,
} from "../src/lib/metrics-contract";
import { MetricTargetDraftEditor } from "../src/components/metrics/MetricTargetDraftEditor";
import { MOCK_METRICS, MOCK_TARGETS } from "../src/components/metrics/target-draft-mock";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
  }
}

const PERIOD: Period = { year: 2026, periodType: "MONTH", periodNo: 10 };

const CONFIRMED_ENTRIES = [1, 2, 3, 4, 5].map((slot) => ({
  slotKey: `d${slot}`,
  value: 10,
  status: "CONFIRMED" as const,
}));

const BASE_ACTUAL: ActualSnapshot = {
  applicable: true,
  value: 50,
  valueSource: "ENTRY",
  unitType: "COUNT",
  measureMode: "PERIOD_FLOW",
  locked: false,
  noActivityConfirmed: false,
  expectedSlots: 5,
  coveredSlots: 5,
  entries: CONFIRMED_ENTRIES,
  classificationComplete: true,
};

const BASE_TARGET: TargetSnapshot = {
  exists: true,
  applicable: true,
  status: "CONFIRMED",
  isOfficial: true,
  year: 2026,
  periodType: "MONTH",
  periodNo: 10,
  value: 100,
  unitType: "COUNT",
  direction: "HIGHER_IS_BETTER",
  labelCode: "KH_THANG",
  measureMode: "PERIOD_FLOW",
};

function actualOf(patch: Partial<ActualSnapshot> = {}): ActualStateResult {
  return deriveActualState({ ...BASE_ACTUAL, ...patch });
}

function targetOf(patch: Partial<TargetSnapshot> = {}): TargetStateResult {
  return deriveTargetState({ ...BASE_TARGET, ...patch }, PERIOD);
}

interface PercentOpts {
  targetValue?: number;
  targetUnitType?: string;
  actualUnitType?: string;
  direction?: Direction;
  measureMode?: MeasureMode;
  mode?: "OFFICIAL" | "PREVIEW";
  metricRequiresConfirm?: boolean;
}

function percentOf(
  actual: ActualStateResult,
  target: TargetStateResult,
  opts: PercentOpts = {}
): PercentResult {
  return computePercent({
    actual,
    target,
    targetValue: opts.targetValue ?? 100,
    targetUnitType: opts.targetUnitType ?? "COUNT",
    actualUnitType: opts.actualUnitType ?? "COUNT",
    direction: opts.direction ?? "HIGHER_IS_BETTER",
    measureMode: opts.measureMode ?? "PERIOD_FLOW",
    policy: {
      ...OFFICIAL_PERCENT_POLICY,
      metricRequiresConfirm: opts.metricRequiresConfirm ?? false,
    },
    mode: opts.mode ?? "OFFICIAL",
  });
}

// ============================================================
// A. TRẠNG THÁI DỮ LIỆU
// ============================================================
console.log("\n[A] TRẠNG THÁI DỮ LIỆU (YC-06)");
check("A1. Không có giá trị → NOT_ENTERED/CHUA_NHAP", (() => {
  const r = actualOf({ value: null, valueSource: "NONE", entries: [], coveredSlots: 0 });
  return r.recordState === "NOT_ENTERED" && r.displayState === "CHUA_NHAP";
})());
check("A2. Xác nhận không phát sinh → NO_ACTIVITY/KHONG_PHAT_SINH", (() => {
  const r = actualOf({ noActivityConfirmed: true, value: null, valueSource: "NONE", entries: [], coveredSlots: 0 });
  return r.recordState === "NO_ACTIVITY" && r.displayState === "KHONG_PHAT_SINH" && r.value === 0;
})());
check("A3. Nhập 0 chưa xác nhận → ENTERED/DA_NHAP (không phải KHONG_PHAT_SINH)", (() => {
  const r = actualOf({ value: 0, entries: [{ slotKey: "d1", value: 0, status: "RECORDED" }], expectedSlots: 1, coveredSlots: 1 });
  return r.recordState === "ENTERED" && r.displayState === "DA_NHAP";
})());
check("A4. Nhập 0 đã xác nhận → CONFIRMED/DA_XAC_NHAN", (() => {
  const r = actualOf({ value: 0, entries: [{ slotKey: "d1", value: 0, status: "CONFIRMED" }], expectedSlots: 1, coveredSlots: 1 });
  return r.recordState === "CONFIRMED" && r.displayState === "DA_XAC_NHAN";
})());
check("A5. Có bản ghi chưa xác nhận → ENTERED", actualOf({ entries: CONFIRMED_ENTRIES.map((e) => ({ ...e, status: "RECORDED" as const })) }).recordState === "ENTERED");
check("A6. Tất cả bản ghi CONFIRMED → CONFIRMED", actualOf().recordState === "CONFIRMED");
check("A7. Có báo cáo đã lưu + có giá trị → LOCKED/DA_CHOT", (() => {
  const r = actualOf({ locked: true });
  return r.recordState === "LOCKED" && r.displayState === "DA_CHOT";
})());
check("A8. Có báo cáo đã lưu nhưng không có giá trị → NOT_ENTERED + reason", (() => {
  const r = actualOf({ locked: true, value: null, valueSource: "NONE", entries: [], coveredSlots: 0 });
  return r.recordState === "NOT_ENTERED" && r.displayState === "CHUA_NHAP" && r.reasons.includes("REPORT_LOCKED_WITHOUT_VALUE");
})());
check("A9. Không áp dụng → NOT_APPLICABLE/KHONG_AP_DUNG", (() => {
  const r = actualOf({ applicable: false });
  return r.recordState === "NOT_APPLICABLE" && r.displayState === "KHONG_AP_DUNG";
})());
check("A10. Thiếu 3/5 slot → coverage PARTIAL/CHUA_DU_KY", (() => {
  const r = actualOf({ entries: CONFIRMED_ENTRIES.slice(0, 2), coveredSlots: 2 });
  return r.coverage === "PARTIAL" && r.displayState === "CHUA_DU_KY";
})());
check("A11. Đủ slot → coverage COMPLETE", actualOf().coverage === "COMPLETE");
check("A12. Không xác định slot → coverage UNKNOWN", actualOf({ expectedSlots: 0 }).coverage === "UNKNOWN");
check("A13. Baseline CONFIRMED có giá trị → CONFIRMED (không phải NOT_ENTERED)", (() => {
  const r = actualOf({ value: 5, valueSource: "BASELINE", baselineStatus: "CONFIRMED", entries: [], expectedSlots: 0, coveredSlots: 0 });
  return r.recordState === "CONFIRMED" && r.displayState === "DA_XAC_NHAN";
})());
check("A14. Baseline PROPOSED → ENTERED", (() => {
  const r = actualOf({ value: 5, valueSource: "BASELINE", baselineStatus: "PROPOSED", entries: [], expectedSlots: 0, coveredSlots: 0 });
  return r.recordState === "ENTERED" && r.displayState === "DA_NHAP";
})());
check("A15. DERIVED có giá trị + inputs confirmed → CONFIRMED", (() => {
  const r = actualOf({ value: 83, valueSource: "DERIVED", derivedInputsComplete: true, derivedInputsConfirmed: true, entries: [], coveredSlots: 0, expectedSlots: 0 });
  return r.recordState === "CONFIRMED";
})());
check("A16. DERIVED có giá trị + inputs chưa confirmed → ENTERED (không phải NOT_ENTERED)", (() => {
  const r = actualOf({ value: 83, valueSource: "DERIVED", derivedInputsComplete: true, derivedInputsConfirmed: false, entries: [], coveredSlots: 0, expectedSlots: 0 });
  return r.recordState === "ENTERED" && r.displayState === "DA_NHAP";
})());
check("A17. DERIVED thiếu input, không có giá trị → NOT_ENTERED + reason", (() => {
  const r = actualOf({ value: null, valueSource: "DERIVED", derivedInputsComplete: false, entries: [], coveredSlots: 0, expectedSlots: 0 });
  return r.recordState === "NOT_ENTERED" && r.reasons.includes("DERIVED_INPUTS_INCOMPLETE");
})());
check("A18. measureMode PENDING_BUSINESS_INPUT → có reason", actualOf({ measureMode: "PENDING_BUSINESS_INPUT" }).reasons.includes("BUSINESS_RULE_PENDING"));

// ============================================================
// B. TRẠNG THÁI CHỈ TIÊU GIAO
// ============================================================
console.log("\n[B] TRẠNG THÁI CHỈ TIÊU GIAO (YC-07)");
check("B1. Không có target → NOT_ASSIGNED", targetOf({ exists: false }).state === "NOT_ASSIGNED");
check("B2. Target DRAFT → DRAFT", targetOf({ status: "DRAFT" }).state === "DRAFT");
check("B3. Target CONFIRMED → CONFIRMED", targetOf({ status: "CONFIRMED" }).state === "CONFIRMED");
check("B4. Target LOCKED → LOCKED", targetOf({ status: "LOCKED" }).state === "LOCKED");
check("B5. Target VOID → VOID", targetOf({ status: "VOID" }).state === "VOID");
check("B6. Target SUPERSEDED → SUPERSEDED", targetOf({ status: "SUPERSEDED" }).state === "SUPERSEDED");
check("B7. Target khác năm → NOT_ASSIGNED + period mismatch", (() => {
  const r = targetOf({ year: 2025 });
  return r.state === "NOT_ASSIGNED" && r.reason === "TARGET_PERIOD_MISMATCH";
})());
check("B8. Target tháng 9, kỳ tháng 10 → NOT_ASSIGNED", targetOf({ periodNo: 9 }).state === "NOT_ASSIGNED");
check("B9. Target quý không dùng cho kỳ tháng → NOT_ASSIGNED", targetOf({ periodType: "QUARTER", periodNo: 4 }).state === "NOT_ASSIGNED");
check("B10. Target không áp dụng → NOT_APPLICABLE", targetOf({ applicable: false }).state === "NOT_APPLICABLE");
check("B11. Target DEMO vẫn có state nhưng isOfficial=false", (() => {
  const r = targetOf({ isOfficial: false });
  return r.state === "CONFIRMED" && r.isOfficial === false;
})());

// ============================================================
// C. TỶ LỆ THỰC HIỆN
// ============================================================
console.log("\n[C] TỶ LỆ THỰC HIỆN (YC-07)");
check("C1. Thiếu target → TARGET_NOT_ASSIGNED", percentOf(actualOf(), targetOf({ exists: false })).reason === "TARGET_NOT_ASSIGNED");
check("C2. Target DRAFT, chế độ official → TARGET_DRAFT", percentOf(actualOf(), targetOf({ status: "DRAFT" })).reason === "TARGET_DRAFT");
check("C3. Target DEMO, chế độ official → TARGET_NOT_OFFICIAL", percentOf(actualOf(), targetOf({ isOfficial: false })).reason === "TARGET_NOT_OFFICIAL");
check("C4. Target 0 → TARGET_ZERO, không trả 0%", (() => {
  const r = percentOf(actualOf(), targetOf(), { targetValue: 0 });
  return r.reason === "TARGET_ZERO" && r.value === null;
})());
check("C5. Target âm → TARGET_NEGATIVE", percentOf(actualOf(), targetOf(), { targetValue: -1 }).reason === "TARGET_NEGATIVE");
check("C6. Thiếu thực hiện → ACTUAL_MISSING", percentOf(actualOf({ value: null, valueSource: "NONE", entries: [], coveredSlots: 0 }), targetOf()).reason === "ACTUAL_MISSING");
check("C7. Thực hiện thiếu kỳ → ACTUAL_PARTIAL", percentOf(actualOf({ entries: CONFIRMED_ENTRIES.slice(0, 2), coveredSlots: 2 }), targetOf()).reason === "ACTUAL_PARTIAL");
check("C8. Thực hiện chưa xác nhận + metric yêu cầu → ACTUAL_NOT_CONFIRMED", (() => {
  const actual = actualOf({ entries: CONFIRMED_ENTRIES.map((e) => ({ ...e, status: "RECORDED" as const })) });
  return percentOf(actual, targetOf(), { metricRequiresConfirm: true }).reason === "ACTUAL_NOT_CONFIRMED";
})());
check("C9. Thiếu phân loại → CLASSIFICATION_INCOMPLETE", percentOf(actualOf({ classificationComplete: false }), targetOf()).reason === "CLASSIFICATION_INCOMPLETE");
check("C10. Lệch đơn vị → UNIT_MISMATCH", percentOf(actualOf(), targetOf(), { actualUnitType: "VND" }).reason === "UNIT_MISMATCH");
check("C11. Chiều NOT_SET → DIRECTION_PENDING", percentOf(actualOf(), targetOf(), { direction: "NOT_SET" }).reason === "DIRECTION_PENDING");
check("C12. Chiều LOWER_IS_BETTER → DIRECTION_RULE_PENDING", percentOf(actualOf(), targetOf(), { direction: "LOWER_IS_BETTER" }).reason === "DIRECTION_RULE_PENDING");
check("C13. measureMode pending → BUSINESS_RULE_PENDING", percentOf(actualOf(), targetOf(), { measureMode: "PENDING_BUSINESS_INPUT" }).reason === "BUSINESS_RULE_PENDING");
check("C14. 50/100 → 50,00%", (() => {
  const r = percentOf(actualOf(), targetOf());
  return r.state === "COMPUTED" && r.value === 50 && r.displayValue === "50,00%";
})());
check("C15. 120/100 → 120,00%", (() => {
  const r = percentOf(actualOf({ value: 120 }), targetOf());
  return r.value === 120 && r.displayValue === "120,00%";
})());
check("C16. 1/3 → 33,33% (2 chữ số, half-up)", (() => {
  const r = percentOf(actualOf({ value: 1, entries: [{ slotKey: "d1", value: 1, status: "CONFIRMED" }], expectedSlots: 1, coveredSlots: 1 }), targetOf(), { targetValue: 3 });
  return r.value === 33.33 && r.displayValue === "33,33%";
})());
check("C17. 0 đã xác nhận + target > 0 → 0,00%", (() => {
  const actual = actualOf({ value: 0, noActivityConfirmed: true, entries: [], expectedSlots: 1, coveredSlots: 0 });
  const r = percentOf(actual, targetOf());
  return r.state === "COMPUTED" && r.value === 0 && r.displayValue === "0,00%";
})());
check("C18. Target LOCKED vẫn tính được", (() => {
  const r = percentOf(actualOf(), targetOf({ status: "LOCKED" }));
  return r.state === "COMPUTED" && r.value === 50;
})());
check("C19. Actual LOCKED vẫn tính được", (() => {
  const r = percentOf(actualOf({ locked: true }), targetOf());
  return r.state === "COMPUTED" && r.value === 50;
})());
check("C20. Chiều NEUTRAL vẫn tính số, không tự gắn đạt/vượt", (() => {
  const r = percentOf(actualOf(), targetOf(), { direction: "NEUTRAL" });
  return r.state === "COMPUTED" && r.value === 50;
})());
check("C21. Preview target DRAFT → tạm tính, provisional=true", (() => {
  const r = percentOf(actualOf(), targetOf({ status: "DRAFT" }), { mode: "PREVIEW" });
  return r.state === "COMPUTED" && r.provisional === true && r.value === 50;
})());
check("C22. Preview actual PARTIAL → tạm tính, provisional=true", (() => {
  const r = percentOf(actualOf({ entries: CONFIRMED_ENTRIES.slice(0, 2), coveredSlots: 2 }), targetOf(), { mode: "PREVIEW" });
  return r.state === "COMPUTED" && r.provisional === true;
})());
check("C23. Preview target DEMO → tạm tính, provisional=true", (() => {
  const r = percentOf(actualOf(), targetOf({ isOfficial: false }), { mode: "PREVIEW" });
  return r.state === "COMPUTED" && r.provisional === true;
})());
check("C24. Preview measureMode pending vẫn bị chặn", percentOf(actualOf(), targetOf(), { mode: "PREVIEW", measureMode: "PENDING_BUSINESS_INPUT" }).reason === "BUSINESS_RULE_PENDING");
check("C25. formatPercentVi(78.18) = 78,18%", formatPercentVi(78.18) === "78,18%");
check("C26. formatPercentVi(null) = null", formatPercentVi(null) === null);

// ============================================================
// D. GỘP PHÂN LOẠI
// ============================================================
console.log("\n[D] GỘP PHÂN LOẠI — KHÔNG COI THIẾU = 0");
const aggPartial = aggregateClassifications([{ id: "O_TO", value: 10 }, { id: "THAN_COC", value: null }]);
const aggFull = aggregateClassifications([{ id: "O_TO", value: 10 }, { id: "THAN_COC", value: 5 }]);
const aggEmpty = aggregateClassifications([{ id: "O_TO", value: null }, { id: "THAN_COC", value: null }]);
check("D1. Một phân loại thiếu → total phần có, complete=false", aggPartial.total === 10 && aggPartial.complete === false);
check("D2. Ghi nhận đúng mã thiếu", aggPartial.missing.includes("THAN_COC"));
check("D3. Đủ phân loại → complete=true", aggFull.total === 15 && aggFull.complete === true);
check("D4. Tất cả thiếu → total=null, không trả 0", aggEmpty.total === null && aggEmpty.complete === false);
check("D5. Không có phân loại → complete=true, total=null", (() => {
  const r = aggregateClassifications([]);
  return r.total === null && r.complete === true;
})());

// ============================================================
// E. VALIDATE TARGET DRAFT
// ============================================================
console.log("\n[E] VALIDATE TARGET DRAFT");
const METRIC = MOCK_METRICS[0];
const VALID_DRAFT: TargetDraftInput = {
  metricId: METRIC.id,
  classificationId: "",
  labelCode: "BTC",
  label: "Chỉ tiêu BTC năm 2026",
  periodType: "YEAR",
  year: 2026,
  periodNo: null,
  value: "1685000000000",
  unitType: METRIC.unitType,
  direction: "NOT_SET",
  sourceNote: "Mock: quyết định giao chỉ tiêu",
  note: "",
  status: "CONFIRMED",
  isOfficial: true,
};

function issuesOf(patch: Partial<TargetDraftInput>, existing: Parameters<typeof validateTargetDraft>[2] = []) {
  return validateTargetDraft({ ...VALID_DRAFT, ...patch }, METRIC, existing);
}

check("E1. Draft hợp lệ không có error", targetDraftErrors(issuesOf({})).length === 0);
check("E2. Confirm thiếu nguồn → SOURCE_REQUIRED", issuesOf({ sourceNote: "" }).some((i) => i.code === "SOURCE_REQUIRED"));
check("E3. Giá trị âm → VALUE_NEGATIVE", issuesOf({ value: "-1" }).some((i) => i.code === "VALUE_NEGATIVE"));
check("E4. Giá trị 0 → warning VALUE_ZERO", issuesOf({ value: "0" }).some((i) => i.code === "VALUE_ZERO" && i.severity === "warning"));
check("E5. Lệch đơn vị → UNIT_MISMATCH", issuesOf({ unitType: "COUNT" }).some((i) => i.code === "UNIT_MISMATCH"));
check("E6. Phân loại không thuộc chỉ tiêu → CLASSIFICATION_INVALID", issuesOf({ classificationId: "bad-class" }).some((i) => i.code === "CLASSIFICATION_INVALID"));
check("E7. Tháng 13 → MONTH_INVALID", issuesOf({ periodType: "MONTH", periodNo: 13 }).some((i) => i.code === "MONTH_INVALID"));
check("E8. Quý 5 → QUARTER_INVALID", issuesOf({ periodType: "QUARTER", periodNo: 5 }).some((i) => i.code === "QUARTER_INVALID"));
check("E9. Thiếu labelCode → LABEL_CODE_REQUIRED", issuesOf({ labelCode: "" }).some((i) => i.code === "LABEL_CODE_REQUIRED"));
check("E10. Thiếu label → LABEL_REQUIRED", issuesOf({ label: "" }).some((i) => i.code === "LABEL_REQUIRED"));
check("E11. Direction NOT_SET khi confirm → warning", issuesOf({ direction: "NOT_SET" }).some((i) => i.code === "DIRECTION_NOT_SET" && i.severity === "warning"));
check("E12. Trùng target cùng loại/kỳ → DUPLICATE_TARGET", (() => {
  const existing = [{ id: "other", labelCode: "BTC", classificationId: "", periodType: "YEAR", year: 2026, periodNo: null, status: "CONFIRMED" as const }];
  return issuesOf({}, existing).some((i) => i.code === "DUPLICATE_TARGET");
})());
check("E13. canConfirmTarget hợp lệ → true", canConfirmTarget(VALID_DRAFT, METRIC) === true);
check("E14. canConfirmTarget thiếu nguồn → false", canConfirmTarget({ ...VALID_DRAFT, sourceNote: "" }, METRIC) === false);
check("E15. parseMetricInput('1.234.567') = 1234567", parseMetricInput("1.234.567") === 1234567);
check("E16. parseMetricInput('1234567,5') = 1234567.5", parseMetricInput("1234567,5") === 1234567.5);
check("E17. parseMetricInput('abc') = null", parseMetricInput("abc") === null);

// ============================================================
// F. CHUYỂN TRẠNG THÁI TARGET
// ============================================================
console.log("\n[F] CHUYỂN TRẠNG THÁI TARGET");
check("F1. DRAFT + CONFIRM → CONFIRMED", nextTargetStatus("DRAFT", "CONFIRM") === "CONFIRMED");
check("F2. CONFIRMED + LOCK → LOCKED", nextTargetStatus("CONFIRMED", "LOCK") === "LOCKED");
check("F3. CONFIRMED + CONFIRM → null", nextTargetStatus("CONFIRMED", "CONFIRM") === null);
check("F4. DRAFT + LOCK → null", nextTargetStatus("DRAFT", "LOCK") === null);
check("F5. CONFIRMED + VOID → VOID", nextTargetStatus("CONFIRMED", "VOID") === "VOID");
check("F6. SUPERSEDED + VOID → null", nextTargetStatus("SUPERSEDED", "VOID") === null);

// ============================================================
// G. SSR SMOKE TEST CHO UI DRAFT
// ============================================================
console.log("\n[G] SSR SMOKE TEST — TARGET UI DRAFT");
const html = renderToStaticMarkup(
  React.createElement(MetricTargetDraftEditor, {
    metrics: MOCK_METRICS,
    initialTargets: MOCK_TARGETS,
  })
);
check("G1. Render được component mock", html.includes("Chỉ tiêu giao — bản nháp UI"));
check("G2. Có nhãn MOCK / chưa nối API", html.includes("MOCK") && html.includes("CHƯA NỐI API"));
check("G3. Có nút lưu nháp/xác nhận", html.includes("Lưu nháp (mock)") && html.includes("Xác nhận (mock)"));
check("G4. Có ghi chú target DRAFT chỉ tạm tính", html.includes("Target") && html.includes("DRAFT") && html.includes("tạm tính"));
check("G5. Có nguồn/căn cứ bắt buộc", html.includes("Nguồn / căn cứ") && html.includes("bắt buộc khi xác nhận"));
check("G6. Có chiều đánh giá C1", html.includes("Chiều đánh giá (C1)") && html.includes("Chưa có quy tắc đánh giá"));
check("G7. Có thông báo chỉ tiêu cấp Cục (Q1)", html.includes("Chỉ tiêu cấp Cục"));

// ============================================================
// H. NHÃN HIỂN THỊ
// ============================================================
console.log("\n[H] NHÃN HIỂN THỊ");
check("H1. Đủ 7 nhãn trạng thái dữ liệu", Object.keys(DISPLAY_STATE_LABELS).length === 7);
check("H2. Có nhãn Không phát sinh", DISPLAY_STATE_LABELS.KHONG_PHAT_SINH === "Không phát sinh");
check("H3. Có nhãn Chưa đủ kỳ", DISPLAY_STATE_LABELS.CHUA_DU_KY === "Chưa đủ kỳ");
check("H4. Có nhãn Chưa giao chỉ tiêu", TARGET_STATE_LABELS.NOT_ASSIGNED === "Chưa giao chỉ tiêu");
check("H5. Có nhãn chiều chưa chốt", DIRECTION_LABELS.NOT_SET === "Chưa có quy tắc đánh giá");
check("H6. Có lý do mẫu số 0", PERCENT_REASON_LABELS.TARGET_ZERO.includes("Mẫu số"));

// ============================================================
// TỔNG HỢP
// ============================================================
console.log("\n[TỔNG HỢP]");
console.log(`PASS ${passed}/${passed + failed}, FAIL ${failed}`);
if (failed > 0) {
  console.log("Failures:", failures.join(" | "));
  process.exitCode = 1;
}
