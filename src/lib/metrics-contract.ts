/**
 * S3 — Phase C: pure contract helpers cho YC-06 / YC-07.
 *
 * Trạng thái: APPROVED theo `S0_DECISION_LOG_2026-10-23.md` (Q1–Q12).
 *
 * Module này:
 *  - Không import DB, Prisma, API, Next.js hay server-only code.
 *  - Là nguồn logic thuần cho state model + target validation + % preview.
 *  - Chưa được nối vào `/giao-ban` hoặc `/api/metrics/*`; S2 sở hữu schema/metrics
 *    shared (Q3=A). Khi S2 công bố schema, S3 mới nối target-only.
 *
 * Quy ước ngôn ngữ:
 *  - Enum giữ tiếng Anh để đồng bộ code hiện có (FLOW/BALANCE/DERIVED...).
 *  - Nhãn hiển thị tiếng Việt nằm ở `DISPLAY_STATE_LABELS`.
 */

export type MeasureMode =
  | "PERIOD_FLOW"
  | "CUMULATIVE"
  | "SNAPSHOT"
  | "DERIVED"
  | "PENDING_BUSINESS_INPUT";

export type BaselineScope = "NONE" | "PERIOD" | "LEDGER" | "PENDING_BUSINESS_INPUT";

export type DataRecordState =
  | "NOT_ENTERED"
  | "ENTERED"
  | "CONFIRMED"
  | "LOCKED"
  | "NO_ACTIVITY"
  | "NOT_APPLICABLE";

export type Coverage = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export type DisplayDataState =
  | "CHUA_NHAP"
  | "CHUA_DU_KY"
  | "KHONG_PHAT_SINH"
  | "DA_NHAP"
  | "DA_XAC_NHAN"
  | "DA_CHOT"
  | "KHONG_AP_DUNG";

export type TargetStatus = "DRAFT" | "CONFIRMED" | "LOCKED" | "VOID" | "SUPERSEDED";

/** Q9 — nguồn dữ liệu chính thức/DEMO. S2 B-C-2 có thể dùng `dataSource`. */
export type DataSource = "REAL" | "DEMO";

export type TargetState =
  | "NOT_APPLICABLE"
  | "NOT_ASSIGNED"
  | "DRAFT"
  | "CONFIRMED"
  | "LOCKED"
  | "VOID"
  | "SUPERSEDED";

export type Direction = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "NEUTRAL" | "NOT_SET";

export type ValueSource = "ENTRY" | "BASELINE" | "DERIVED" | "NONE";

export type PercentState = "COMPUTED" | "NOT_COMPUTED";

export type PercentReason =
  | "NOT_APPLICABLE"
  | "TARGET_NOT_ASSIGNED"
  | "TARGET_DRAFT"
  | "TARGET_INACTIVE"
  | "TARGET_NOT_OFFICIAL"
  | "TARGET_ZERO"
  | "TARGET_NEGATIVE"
  | "ACTUAL_MISSING"
  | "ACTUAL_PARTIAL"
  | "ACTUAL_NOT_CONFIRMED"
  | "CLASSIFICATION_INCOMPLETE"
  | "UNIT_MISMATCH"
  | "DIRECTION_PENDING"
  | "DIRECTION_RULE_PENDING"
  | "BUSINESS_RULE_PENDING";

export const DISPLAY_STATE_LABELS: Record<DisplayDataState, string> = {
  CHUA_NHAP: "Chưa nhập",
  CHUA_DU_KY: "Chưa đủ kỳ",
  KHONG_PHAT_SINH: "Không phát sinh",
  DA_NHAP: "Đã nhập",
  DA_XAC_NHAN: "Đã xác nhận",
  DA_CHOT: "Đã chốt báo cáo",
  KHONG_AP_DUNG: "Không áp dụng",
};

export const TARGET_STATE_LABELS: Record<TargetState, string> = {
  NOT_APPLICABLE: "Không áp dụng",
  NOT_ASSIGNED: "Chưa giao chỉ tiêu",
  DRAFT: "Chỉ tiêu nháp",
  CONFIRMED: "Đã xác nhận",
  LOCKED: "Đã khóa",
  VOID: "Đã hủy",
  SUPERSEDED: "Đã thay thế",
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  HIGHER_IS_BETTER: "Cao hơn tốt",
  LOWER_IS_BETTER: "Thấp hơn tốt",
  NEUTRAL: "Trung tính",
  NOT_SET: "Chưa có quy tắc đánh giá",
};

export const PERCENT_REASON_LABELS: Record<PercentReason, string> = {
  NOT_APPLICABLE: "Không áp dụng",
  TARGET_NOT_ASSIGNED: "Chưa giao chỉ tiêu",
  TARGET_DRAFT: "Chỉ tiêu nháp — chưa tính chính thức",
  TARGET_INACTIVE: "Chỉ tiêu đã hủy/thay thế",
  TARGET_NOT_OFFICIAL: "Chỉ tiêu DEMO/chưa chính thức",
  TARGET_ZERO: "Mẫu số bằng 0 — chưa có quy tắc",
  TARGET_NEGATIVE: "Chỉ tiêu âm không hợp lệ",
  ACTUAL_MISSING: "Thiếu dữ liệu thực hiện",
  ACTUAL_PARTIAL: "Thực hiện chưa đủ kỳ",
  ACTUAL_NOT_CONFIRMED: "Thực hiện chưa xác nhận",
  CLASSIFICATION_INCOMPLETE: "Thiếu dữ liệu phân loại",
  UNIT_MISMATCH: "Lệch đơn vị tính",
  DIRECTION_PENDING: "Chưa có quy tắc đánh giá",
  DIRECTION_RULE_PENDING: "Chưa có quy tắc cho chỉ tiêu thấp hơn tốt",
  BUSINESS_RULE_PENDING: "Chưa có quy tắc tổng hợp lũy kế/số dư",
};

export const TARGET_LABEL_CODES = ["BTC", "UBND", "KH_THANG", "KH_QUY", "KH_NAM", "KHAC"] as const;
export type TargetLabelCode = (typeof TARGET_LABEL_CODES)[number];

/** Các mã Q6 còn PENDING_BUSINESS_INPUT; không được tự tính lũy kế/số dư. */
export const PENDING_BUSINESS_METRIC_CODES = new Set([
  "PHI_LK_THU",
  "PHI_CON",
  "XOA_NO",
  "NO_THUE",
  "TV_CHO",
]);

export interface Period {
  year: number;
  periodType: "YEAR" | "QUARTER" | "MONTH";
  periodNo: number | null;
}

export interface EntrySnapshot {
  value: number;
  status: "DRAFT" | "RECORDED" | "SUBMITTED" | "CONFIRMED" | "NEEDS_FIX";
  slotKey?: string;
}

export interface ActualSnapshot {
  applicable: boolean;
  value: number | null;
  valueSource: ValueSource;
  unitType: string;
  measureMode: MeasureMode;
  locked: boolean;
  noActivityConfirmed: boolean;
  expectedSlots: number;
  coveredSlots?: number;
  entries?: EntrySnapshot[];
  baselineStatus?: "PROPOSED" | "CONFIRMED" | null;
  derivedInputsComplete?: boolean;
  derivedInputsConfirmed?: boolean;
  classificationComplete: boolean;
}

export interface ActualStateResult {
  recordState: DataRecordState;
  coverage: Coverage;
  displayState: DisplayDataState;
  value: number | null;
  classificationComplete: boolean;
  reasons: string[];
}

export interface TargetSnapshot {
  exists: boolean;
  applicable: boolean;
  status: TargetStatus;
  /** Có thể lấy trực tiếp hoặc map từ `dataSource` qua resolveOfficialFlag(). */
  isOfficial?: boolean;
  dataSource?: DataSource;
  year: number;
  periodType: "YEAR" | "QUARTER" | "MONTH";
  periodNo: number | null;
  value: number;
  unitType: string;
  direction: Direction;
  labelCode?: TargetLabelCode | "";
  measureMode?: MeasureMode;
}

export interface TargetStateResult {
  state: TargetState;
  matchesPeriod: boolean;
  isOfficial: boolean;
  reason?: string;
}

export interface PercentPolicy {
  requireConfirmedTarget: boolean;
  requireCompleteActual: boolean;
  requireClassificationComplete: boolean;
  metricRequiresConfirm: boolean;
}

export interface PercentResult {
  state: PercentState;
  value: number | null;
  displayValue: string | null;
  reason: PercentReason | null;
  /** Chỉ dùng cho preview khi target DRAFT/DEMO hoặc actual chưa đủ; không dùng báo cáo. */
  provisional: boolean;
}

export interface PercentInput {
  actual: ActualStateResult;
  target: TargetStateResult;
  targetValue: number;
  targetUnitType: string;
  actualUnitType: string;
  direction: Direction;
  measureMode: MeasureMode;
  policy: PercentPolicy;
  /** OFFICIAL: chỉ tính chính thức. PREVIEW: cho phép tạm tính có nhãn. */
  mode?: "OFFICIAL" | "PREVIEW";
}

export const OFFICIAL_PERCENT_POLICY: PercentPolicy = {
  requireConfirmedTarget: true,
  requireCompleteActual: true,
  requireClassificationComplete: true,
  metricRequiresConfirm: false,
};

export function roundPercent2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatPercentVi(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${roundPercent2(value).toFixed(2).replace(".", ",")}%`;
}

export function formatNumberVi(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits,
  }).format(value);
}

/**
 * Chuẩn hóa số người dùng nhập; tương thích quy ước hiện có:
 * "1.234.567", "1234567,5", "1234.5", số âm. Trả null nếu không hợp lệ.
 */
export function parseMetricInput(input: string | number): number | null {
  let text = typeof input === "number" ? String(input) : input;
  if (typeof text !== "string") return null;
  text = text.trim().replace(/\s+/g, "");
  if (!text) return null;
  text = text.replace(/[₫đ]/gi, "");
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) >= 1e18) return null;
  return n;
}

function coverageOf(snapshot: ActualSnapshot): Coverage {
  if (snapshot.noActivityConfirmed) {
    return snapshot.expectedSlots > 0 ? "COMPLETE" : "UNKNOWN";
  }
  if (snapshot.expectedSlots <= 0) return "UNKNOWN";
  const covered =
    snapshot.coveredSlots ??
    (snapshot.entries?.length
      ? new Set(snapshot.entries.map((e, i) => e.slotKey ?? String(i))).size
      : snapshot.value !== null
        ? 1
        : 0);
  return covered >= snapshot.expectedSlots ? "COMPLETE" : "PARTIAL";
}

function displayStateOf(recordState: DataRecordState, coverage: Coverage): DisplayDataState {
  switch (recordState) {
    case "NOT_APPLICABLE":
      return "KHONG_AP_DUNG";
    case "NO_ACTIVITY":
      return "KHONG_PHAT_SINH";
    case "LOCKED":
      return "DA_CHOT";
    case "CONFIRMED":
      return coverage === "PARTIAL" ? "CHUA_DU_KY" : "DA_XAC_NHAN";
    case "ENTERED":
      return coverage === "PARTIAL" ? "CHUA_DU_KY" : "DA_NHAP";
    case "NOT_ENTERED":
    default:
      return "CHUA_NHAP";
  }
}

/**
 * Xác định trạng thái dữ liệu từ **nguồn của giá trị đang hiển thị**
 * (entry/baseline/derived), không chỉ từ bản ghi trực tiếp.
 */
export function deriveActualState(snapshot: ActualSnapshot): ActualStateResult {
  const coverage = coverageOf(snapshot);
  const reasons: string[] = [];
  const value = snapshot.value;

  if (!snapshot.applicable) {
    return {
      recordState: "NOT_APPLICABLE",
      coverage: "UNKNOWN",
      displayState: "KHONG_AP_DUNG",
      value: null,
      classificationComplete: snapshot.classificationComplete,
      reasons: ["NOT_IN_SCOPE"],
    };
  }

  if (snapshot.noActivityConfirmed) {
    return {
      recordState: "NO_ACTIVITY",
      coverage: snapshot.expectedSlots > 0 ? "COMPLETE" : "UNKNOWN",
      displayState: "KHONG_PHAT_SINH",
      value: 0,
      classificationComplete: snapshot.classificationComplete,
      reasons: ["NO_ACTIVITY_CONFIRMED"],
    };
  }

  if (value === null) {
    if (snapshot.locked) reasons.push("REPORT_LOCKED_WITHOUT_VALUE");
    if (snapshot.valueSource === "DERIVED" && snapshot.derivedInputsComplete === false) {
      reasons.push("DERIVED_INPUTS_INCOMPLETE");
    }
    reasons.push("NO_VALUE");
    return {
      recordState: "NOT_ENTERED",
      coverage,
      displayState: "CHUA_NHAP",
      value: null,
      classificationComplete: snapshot.classificationComplete,
      reasons,
    };
  }

  let recordState: DataRecordState;
  if (snapshot.locked) {
    recordState = "LOCKED";
    reasons.push("REPORT_LOCKED");
  } else if (snapshot.valueSource === "ENTRY") {
    const entries = snapshot.entries ?? [];
    const allConfirmed = entries.length > 0 && entries.every((e) => e.status === "CONFIRMED");
    recordState = allConfirmed ? "CONFIRMED" : "ENTERED";
    if (allConfirmed) reasons.push("ALL_ENTRIES_CONFIRMED");
    else reasons.push("ENTRIES_NOT_ALL_CONFIRMED");
  } else if (snapshot.valueSource === "BASELINE") {
    recordState = snapshot.baselineStatus === "CONFIRMED" ? "CONFIRMED" : "ENTERED";
    reasons.push(recordState === "CONFIRMED" ? "BASELINE_CONFIRMED" : "BASELINE_PROPOSED");
  } else if (snapshot.valueSource === "DERIVED") {
    if (snapshot.derivedInputsConfirmed) {
      recordState = "CONFIRMED";
      reasons.push("DERIVED_INPUTS_CONFIRMED");
    } else {
      recordState = "ENTERED";
      reasons.push("DERIVED_INPUTS_NOT_ALL_CONFIRMED");
    }
    if (snapshot.derivedInputsComplete === false) {
      reasons.push("DERIVED_INPUTS_INCOMPLETE");
    }
  } else {
    recordState = "ENTERED";
    reasons.push("VALUE_WITHOUT_SOURCE");
  }

  if (coverage === "PARTIAL") reasons.push("COVERAGE_PARTIAL");
  if (coverage === "UNKNOWN") reasons.push("COVERAGE_UNKNOWN");
  if (!snapshot.classificationComplete) reasons.push("CLASSIFICATION_INCOMPLETE");
  if (snapshot.measureMode === "PENDING_BUSINESS_INPUT") reasons.push("BUSINESS_RULE_PENDING");

  return {
    recordState,
    coverage,
    displayState: displayStateOf(recordState, coverage),
    value,
    classificationComplete: snapshot.classificationComplete,
    reasons,
  };
}

function samePeriod(target: TargetSnapshot, period: Period): boolean {
  if (target.year !== period.year) return false;
  if (target.periodType !== period.periodType) return false;
  if (target.periodType === "YEAR") return true;
  return target.periodNo === period.periodNo;
}

/**
 * Q9: `dataSource` là nguồn chuẩn khi B-C-2 trả cờ này; nếu không có thì dùng
 * `isOfficial`. DEMO luôn thắng nếu dữ liệu mâu thuẫn — không dùng regex nhãn.
 */
export function resolveOfficialFlag(target: { isOfficial?: boolean; dataSource?: DataSource }): boolean {
  if (target.dataSource) return target.dataSource === "REAL";
  return target.isOfficial === true;
}

export function deriveTargetState(target: TargetSnapshot, period: Period): TargetStateResult {
  const official = resolveOfficialFlag(target);
  if (!target.applicable) {
    return { state: "NOT_APPLICABLE", matchesPeriod: false, isOfficial: official, reason: "NOT_IN_SCOPE" };
  }
  if (!target.exists) {
    return { state: "NOT_ASSIGNED", matchesPeriod: false, isOfficial: false, reason: "NO_TARGET" };
  }
  if (!samePeriod(target, period)) {
    return {
      state: "NOT_ASSIGNED",
      matchesPeriod: false,
      isOfficial: official,
      reason: "TARGET_PERIOD_MISMATCH",
    };
  }

  switch (target.status) {
    case "VOID":
      return { state: "VOID", matchesPeriod: true, isOfficial: official, reason: "TARGET_VOID" };
    case "SUPERSEDED":
      return { state: "SUPERSEDED", matchesPeriod: true, isOfficial: official, reason: "TARGET_SUPERSEDED" };
    case "LOCKED":
      return { state: "LOCKED", matchesPeriod: true, isOfficial: official };
    case "CONFIRMED":
      return { state: "CONFIRMED", matchesPeriod: true, isOfficial: official };
    case "DRAFT":
    default:
      return { state: "DRAFT", matchesPeriod: true, isOfficial: official };
  }
}

/**
 * Tính % theo Q4.
 *
 * OFFICIAL: chỉ target CONFIRMED/LOCKED + official + actual hợp lệ.
 * PREVIEW: cho phép target DRAFT/DEMO, actual thiếu kỳ/chưa xác nhận; kết quả
 *          `provisional=true`, UI phải gắn nhãn “tạm tính”, không dùng báo cáo.
 */
export function computePercent(input: PercentInput): PercentResult {
  const mode = input.mode ?? "OFFICIAL";
  const blocked = (reason: PercentReason): PercentResult => ({
    state: "NOT_COMPUTED",
    value: null,
    displayValue: null,
    reason,
    provisional: false,
  });

  if (input.actual.recordState === "NOT_APPLICABLE" || input.target.state === "NOT_APPLICABLE") {
    return blocked("NOT_APPLICABLE");
  }
  if (input.target.state === "NOT_ASSIGNED") return blocked("TARGET_NOT_ASSIGNED");
  if (input.target.state === "VOID" || input.target.state === "SUPERSEDED") return blocked("TARGET_INACTIVE");

  const targetDraft = input.target.state === "DRAFT";
  const targetNotOfficial = !input.target.isOfficial;

  if (mode === "OFFICIAL" && targetDraft) return blocked("TARGET_DRAFT");
  if (mode === "OFFICIAL" && targetNotOfficial) return blocked("TARGET_NOT_OFFICIAL");

  if (input.targetValue < 0) return blocked("TARGET_NEGATIVE");
  if (input.targetValue === 0) return blocked("TARGET_ZERO");

  if (input.actual.value === null) return blocked("ACTUAL_MISSING");
  if (input.measureMode === "PENDING_BUSINESS_INPUT") return blocked("BUSINESS_RULE_PENDING");

  if (mode === "OFFICIAL" && input.policy.requireCompleteActual && input.actual.coverage === "PARTIAL") {
    return blocked("ACTUAL_PARTIAL");
  }
  if (mode === "OFFICIAL" && input.policy.requireClassificationComplete && !input.actual.classificationComplete) {
    return blocked("CLASSIFICATION_INCOMPLETE");
  }
  if (
    mode === "OFFICIAL" &&
    input.policy.metricRequiresConfirm &&
    input.actual.recordState === "ENTERED"
  ) {
    return blocked("ACTUAL_NOT_CONFIRMED");
  }

  if (input.targetUnitType !== input.actualUnitType) return blocked("UNIT_MISMATCH");
  if (input.direction === "NOT_SET") return blocked("DIRECTION_PENDING");
  if (input.direction === "LOWER_IS_BETTER") return blocked("DIRECTION_RULE_PENDING");

  const raw = (input.actual.value / input.targetValue) * 100;
  const value = roundPercent2(raw);
  return {
    state: "COMPUTED",
    value,
    displayValue: formatPercentVi(value),
    reason: null,
    provisional: mode === "PREVIEW" || targetDraft || targetNotOfficial,
  };
}

/**
 * Gộp phân loại: không coi phân loại thiếu là 0.
 * Trả tổng phần có dữ liệu + cờ đầy đủ + danh sách thiếu.
 */
export function aggregateClassifications(
  rows: { id: string; value: number | null }[]
): { total: number | null; complete: boolean; missing: string[] } {
  if (rows.length === 0) return { total: null, complete: true, missing: [] };
  const missing = rows.filter((r) => r.value === null).map((r) => r.id);
  const present = rows.filter((r): r is { id: string; value: number } => r.value !== null);
  if (present.length === 0) return { total: null, complete: false, missing };
  return {
    total: present.reduce((acc, r) => acc + r.value, 0),
    complete: missing.length === 0,
    missing,
  };
}

export interface ClassificationOption {
  id: string;
  code: string;
  label: string;
}

export interface MetricOption {
  id: string;
  code: string;
  name: string;
  unitType: string;
  unitLabel?: string | null;
  measureMode: MeasureMode;
  direction: Direction;
  classifications: ClassificationOption[];
}

export interface TargetDraftInput {
  id?: string;
  metricId: string;
  classificationId: string;
  labelCode: TargetLabelCode | "";
  label: string;
  periodType: "YEAR" | "QUARTER" | "MONTH";
  year: number | null;
  periodNo: number | null;
  value: string;
  unitType: string;
  direction: Direction;
  sourceNote: string;
  note: string;
  status: TargetStatus;
  isOfficial: boolean;
}

export interface TargetValidationIssue {
  field: keyof TargetDraftInput | "periodNo" | "metricId";
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface ExistingTargetKey {
  id?: string;
  labelCode?: string;
  classificationId?: string;
  periodType: string;
  year: number;
  periodNo: number | null;
  status: TargetStatus;
}

/**
 * Validate target draft cho UI. Không đọc DB; `existingTargets` là mock/props.
 * Q2: CONFIRMED bắt buộc nguồn/căn cứ. Q4: target 0 chỉ warning, không tự tính %.
 */
export function validateTargetDraft(
  draft: TargetDraftInput,
  metric: MetricOption | undefined,
  existingTargets: ExistingTargetKey[] = []
): TargetValidationIssue[] {
  const issues: TargetValidationIssue[] = [];
  const add = (
    field: TargetValidationIssue["field"],
    code: string,
    message: string,
    severity: TargetValidationIssue["severity"] = "error"
  ) => issues.push({ field, code, message, severity });

  if (!metric) {
    add("metricId", "METRIC_REQUIRED", "Phải chọn chỉ tiêu.");
    return issues;
  }

  if (!TARGET_LABEL_CODES.includes(draft.labelCode as TargetLabelCode)) {
    add("labelCode", "LABEL_CODE_REQUIRED", "Phải chọn loại chỉ tiêu giao (BTC/UBND/KH...).");
  }
  if (!draft.label.trim()) add("label", "LABEL_REQUIRED", "Phải nhập tên hiển thị của chỉ tiêu giao.");

  if (!draft.year || !Number.isInteger(draft.year) || draft.year < 2000 || draft.year > 2100) {
    add("year", "YEAR_INVALID", "Năm phải là số nguyên từ 2000 đến 2100.");
  }
  if (draft.periodType === "MONTH" && (!draft.periodNo || draft.periodNo < 1 || draft.periodNo > 12)) {
    add("periodNo", "MONTH_INVALID", "Tháng phải từ 1 đến 12.");
  }
  if (draft.periodType === "QUARTER" && (!draft.periodNo || draft.periodNo < 1 || draft.periodNo > 4)) {
    add("periodNo", "QUARTER_INVALID", "Quý phải từ 1 đến 4.");
  }

  const value = parseMetricInput(draft.value);
  if (value === null) add("value", "VALUE_INVALID", "Giá trị chỉ tiêu không hợp lệ.");
  else if (value < 0) add("value", "VALUE_NEGATIVE", "Giá trị chỉ tiêu không được âm.");
  else if (value === 0) add("value", "VALUE_ZERO", "Chỉ tiêu bằng 0 sẽ không dùng làm mẫu số; cần quy tắc riêng.", "warning");

  if (draft.unitType !== metric.unitType) {
    add("unitType", "UNIT_MISMATCH", `Đơn vị phải khớp chỉ tiêu (${metric.unitType}).`);
  }

  if (
    draft.classificationId &&
    !metric.classifications.some((c) => c.id === draft.classificationId)
  ) {
    add("classificationId", "CLASSIFICATION_INVALID", "Phân loại không thuộc chỉ tiêu đã chọn.");
  }

  if (draft.status === "CONFIRMED" && !draft.sourceNote.trim()) {
    add("sourceNote", "SOURCE_REQUIRED", "Xác nhận chỉ tiêu phải có nguồn/căn cứ.");
  }
  if (draft.status === "CONFIRMED" && draft.direction === "NOT_SET") {
    add("direction", "DIRECTION_NOT_SET", "Chưa có chiều đánh giá C1; chỉ tiêu có thể xác nhận nhưng chưa tính % đạt/vượt.", "warning");
  }

  const duplicate = existingTargets.find(
    (t) =>
      t.id !== draft.id &&
      t.status !== "VOID" &&
      t.status !== "SUPERSEDED" &&
      (t.labelCode ?? "") === (draft.labelCode ?? "") &&
      (t.classificationId ?? "") === (draft.classificationId ?? "") &&
      t.periodType === draft.periodType &&
      t.year === draft.year &&
      t.periodNo === draft.periodNo
  );
  if (duplicate) {
    add("labelCode", "DUPLICATE_TARGET", "Đã có chỉ tiêu giao cùng loại/kỳ/phân loại — sửa bản ghi cũ thay vì thêm mới.");
  }

  return issues;
}

export function targetDraftErrors(issues: TargetValidationIssue[]): TargetValidationIssue[] {
  return issues.filter((i) => i.severity === "error");
}

export function canConfirmTarget(draft: TargetDraftInput, metric: MetricOption | undefined, existingTargets: ExistingTargetKey[] = []): boolean {
  return targetDraftErrors(validateTargetDraft({ ...draft, status: "CONFIRMED" }, metric, existingTargets)).length === 0;
}

export function nextTargetStatus(current: TargetStatus, action: "CONFIRM" | "LOCK" | "VOID" | "SUPERSEDE"): TargetStatus | null {
  if (action === "CONFIRM") return current === "DRAFT" ? "CONFIRMED" : null;
  if (action === "LOCK") return current === "CONFIRMED" ? "LOCKED" : null;
  if (action === "VOID") return current === "VOID" || current === "SUPERSEDED" ? null : "VOID";
  if (action === "SUPERSEDE") return current === "VOID" ? null : "SUPERSEDED";
  return null;
}
