/**
 * S3 — Phase C: mapping layer B-C-2 → contract nội bộ S3.
 *
 * Trạng thái: chuẩn bị trong lúc `WAIT_B_C_2`; **không** import DB/API.
 * S0 đã chốt D3–D7:
 *  - D3: B-C-2 giữ `PROPOSED`; S3 map nội bộ/UI sang `DRAFT`.
 *  - D4: `comparisonKind` tường minh → `labelCode`; không dùng regex nhãn.
 *  - D5: `direction` + `measureMode`/`baselineScope` lấy từ B-C-2; thiếu thì
 *        `NOT_SET`/`PENDING_BUSINESS_INPUT`, không tự suy.
 *  - D6: quyền `metrics.config` / `metrics.entry_all`.
 *  - D7=A: service/route target-only thuộc S3 sau khi B-C-2 publish.
 *
 * File này chỉ là pure mapping; chưa nối API/schema.
 */
import {
  type BaselineScope,
  type DataSource,
  type Direction,
  type MeasureMode,
  type TargetDraftInput,
  type TargetLabelCode,
  type TargetSnapshot,
  type TargetStatus,
  parseMetricInput,
  resolveOfficialFlag,
} from "./metrics-contract";

export type Bc2TargetStatus = "PROPOSED" | "CONFIRMED" | "LOCKED" | "VOID" | "SUPERSEDED";

export type Bc2ComparisonKind =
  | "BTC_YEAR"
  | "UBND_YEAR"
  | "MONTH_PLAN"
  | "KHAC"
  | "NONE"
  | string;

export type Bc2DataSource = DataSource;
export type Bc2Direction = Direction;
export type Bc2MeasureMode = MeasureMode;
export type Bc2BaselineScope = BaselineScope;

/** DTO tối thiểu S3 cần từ B-C-2; field lạ được bỏ qua. */
export interface Bc2TargetDto {
  id: string;
  metricId: string;
  classificationId?: string | null;
  comparisonKind: Bc2ComparisonKind;
  label?: string | null;
  periodType: "YEAR" | "QUARTER" | "MONTH";
  year: number;
  periodNo: number | null;
  valueBase: number | string;
  unitType: string;
  dataSource?: Bc2DataSource | null;
  isOfficial?: boolean | null;
  status: Bc2TargetStatus | string;
  direction?: Bc2Direction | null;
  measureMode?: Bc2MeasureMode | null;
  baselineScope?: Bc2BaselineScope | null;
  sourceNote?: string | null;
  note?: string | null;
  proposedByName?: string | null;
  proposedAt?: string | null;
  confirmedByName?: string | null;
  confirmedAt?: string | null;
  lockedByName?: string | null;
  lockedAt?: string | null;
  revisionNo?: number | null;
}

export interface Bc2MappingIssue {
  field: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface Bc2MappingResult<T> {
  value: T | null;
  issues: Bc2MappingIssue[];
}

export interface S3TargetView extends TargetSnapshot {
  baselineScope: BaselineScope;
  comparisonKind: Bc2ComparisonKind;
  sourceNote: string | null;
  revisionNo: number | null;
  proposedByName: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
}

const VALID_DIRECTIONS: Direction[] = ["HIGHER_IS_BETTER", "LOWER_IS_BETTER", "NEUTRAL", "NOT_SET"];
const VALID_MEASURE_MODES: MeasureMode[] = [
  "PERIOD_FLOW",
  "CUMULATIVE",
  "SNAPSHOT",
  "DERIVED",
  "PENDING_BUSINESS_INPUT",
];
const VALID_BASELINE_SCOPES: BaselineScope[] = ["NONE", "PERIOD", "LEDGER", "PENDING_BUSINESS_INPUT"];

function issue(
  field: string,
  code: string,
  message: string,
  severity: Bc2MappingIssue["severity"] = "error"
): Bc2MappingIssue {
  return { field, code, message, severity };
}

/** D3 — B-C-2 giữ `PROPOSED`; S3 nội bộ dùng `DRAFT`. */
export function mapBc2StatusToS3(status: string): TargetStatus | null {
  switch (status) {
    case "PROPOSED":
      return "DRAFT";
    case "CONFIRMED":
      return "CONFIRMED";
    case "LOCKED":
      return "LOCKED";
    case "VOID":
      return "VOID";
    case "SUPERSEDED":
      return "SUPERSEDED";
    default:
      return null;
  }
}

/** D3 — payload S3 gửi B-C-2: DRAFT phải ghi thành PROPOSED. */
export function mapS3StatusToBc2(status: TargetStatus): Bc2TargetStatus {
  return status === "DRAFT" ? "PROPOSED" : status;
}

/** D4 — chỉ map 3 loại so sánh tường minh; không đoán từ nhãn. */
export function mapComparisonKindToLabelCode(kind: string): TargetLabelCode | null {
  switch (kind) {
    case "BTC_YEAR":
      return "BTC";
    case "UBND_YEAR":
      return "UBND";
    case "MONTH_PLAN":
      return "KH_THANG";
    case "NONE":
    default:
      return null;
  }
}

/** D4 — B-C-2 chỉ có 3 kind so sánh + NONE; KHAC là "không đối chiếu". */
export function mapLabelCodeToComparisonKind(labelCode: TargetLabelCode | "" | null | undefined): Bc2ComparisonKind | null {
  switch (labelCode) {
    case "BTC":
      return "BTC_YEAR";
    case "UBND":
      return "UBND_YEAR";
    case "KH_THANG":
      return "MONTH_PLAN";
    case "KHAC":
      return "NONE";
    case "KH_QUY":
    case "KH_NAM":
    default:
      return null;
  }
}

/** D5 — thiếu/không hợp lệ thì NOT_SET, không tự suy từ tên/valueKind. */
export function mapDirection(value: string | null | undefined): Direction {
  return value && VALID_DIRECTIONS.includes(value as Direction) ? (value as Direction) : "NOT_SET";
}

/** D5 — thiếu/không hợp lệ thì PENDING_BUSINESS_INPUT, không tự suy. */
export function mapMeasureMode(value: string | null | undefined): MeasureMode {
  return value && VALID_MEASURE_MODES.includes(value as MeasureMode)
    ? (value as MeasureMode)
    : "PENDING_BUSINESS_INPUT";
}

/** D5 — thiếu/không hợp lệ thì PENDING_BUSINESS_INPUT, không tự suy. */
export function mapBaselineScope(value: string | null | undefined): BaselineScope {
  return value && VALID_BASELINE_SCOPES.includes(value as BaselineScope)
    ? (value as BaselineScope)
    : "PENDING_BUSINESS_INPUT";
}

function parseValueBase(value: number | string): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = parseMetricInput(value);
  return parsed === null ? null : parsed;
}

function validatePeriod(dto: Bc2TargetDto, issues: Bc2MappingIssue[]): boolean {
  if (!["YEAR", "QUARTER", "MONTH"].includes(dto.periodType)) {
    issues.push(issue("periodType", "PERIOD_TYPE_INVALID", "periodType không hợp lệ."));
    return false;
  }
  if (!Number.isInteger(dto.year) || dto.year < 2000 || dto.year > 2100) {
    issues.push(issue("year", "YEAR_INVALID", "Năm không hợp lệ."));
    return false;
  }
  if (dto.periodType === "MONTH" && (!dto.periodNo || dto.periodNo < 1 || dto.periodNo > 12)) {
    issues.push(issue("periodNo", "MONTH_INVALID", "Tháng phải từ 1–12."));
    return false;
  }
  if (dto.periodType === "QUARTER" && (!dto.periodNo || dto.periodNo < 1 || dto.periodNo > 4)) {
    issues.push(issue("periodNo", "QUARTER_INVALID", "Quý phải từ 1–4."));
    return false;
  }
  return true;
}

/**
 * Chuyển DTO B-C-2 → `TargetSnapshot` nội bộ.
 * - PROPOSED → DRAFT.
 * - comparisonKind → labelCode.
 * - dataSource/isOfficial → isOfficial (DEMO thắng).
 * - direction/measureMode/baselineScope thiếu → trạng thái pending, có warning.
 */
export function mapBc2TargetToS3(dto: Bc2TargetDto): Bc2MappingResult<S3TargetView> {
  const issues: Bc2MappingIssue[] = [];
  const status = mapBc2StatusToS3(dto.status);
  if (!status) {
    issues.push(issue("status", "STATUS_UNKNOWN", `Trạng thái B-C-2 không hỗ trợ: ${dto.status}.`));
  }

  const value = parseValueBase(dto.valueBase);
  if (value === null) {
    issues.push(issue("valueBase", "VALUE_INVALID", "valueBase không phải số hợp lệ."));
  }

  const periodOk = validatePeriod(dto, issues);
  if (!dto.unitType) issues.push(issue("unitType", "UNIT_MISSING", "Thiếu unitType."));

  const labelCode = mapComparisonKindToLabelCode(dto.comparisonKind);
  if (!labelCode && dto.comparisonKind !== "NONE") {
    issues.push(
      issue(
        "comparisonKind",
        "COMPARISON_KIND_UNKNOWN",
        `comparisonKind chưa map được sang labelCode: ${dto.comparisonKind}.`,
        "warning"
      )
    );
  }

  if (
    dto.dataSource !== "REAL" &&
    dto.dataSource !== "DEMO" &&
    (dto.isOfficial === undefined || dto.isOfficial === null)
  ) {
    issues.push(
      issue(
        "dataSource",
        "OFFICIAL_FLAG_MISSING",
        "B-C-2 phải trả dataSource hoặc isOfficial; mặc định coi là không chính thức.",
        "warning"
      )
    );
  }

  const direction = mapDirection(dto.direction);
  if (!dto.direction || !VALID_DIRECTIONS.includes(dto.direction as Direction)) {
    issues.push(issue("direction", "DIRECTION_MISSING", "Thiếu direction; dùng NOT_SET, không tự suy.", "warning"));
  }

  const measureMode = mapMeasureMode(dto.measureMode);
  if (!dto.measureMode || !VALID_MEASURE_MODES.includes(dto.measureMode as MeasureMode)) {
    issues.push(
      issue("measureMode", "MEASURE_MODE_MISSING", "Thiếu measureMode; dùng PENDING_BUSINESS_INPUT.", "warning")
    );
  }

  const baselineScope = mapBaselineScope(dto.baselineScope);
  if (!dto.baselineScope || !VALID_BASELINE_SCOPES.includes(dto.baselineScope as BaselineScope)) {
    issues.push(
      issue(
        "baselineScope",
        "BASELINE_SCOPE_MISSING",
        "Thiếu baselineScope; dùng PENDING_BUSINESS_INPUT.",
        "warning"
      )
    );
  }

  if (!status || value === null || !periodOk || !dto.unitType) {
    return { value: null, issues };
  }

  const isOfficial = resolveOfficialFlag({
    dataSource: dto.dataSource ?? undefined,
    isOfficial: dto.isOfficial ?? undefined,
  });

  return {
    value: {
      exists: true,
      applicable: true,
      status,
      isOfficial,
      dataSource: dto.dataSource ?? undefined,
      year: dto.year,
      periodType: dto.periodType,
      periodNo: dto.periodNo,
      value,
      unitType: dto.unitType,
      direction,
      labelCode: labelCode ?? "",
      measureMode,
      baselineScope,
      comparisonKind: dto.comparisonKind,
      sourceNote: dto.sourceNote ?? null,
      revisionNo: dto.revisionNo ?? null,
      proposedByName: dto.proposedByName ?? null,
      confirmedByName: dto.confirmedByName ?? null,
      confirmedAt: dto.confirmedAt ?? null,
    },
    issues,
  };
}

/**
 * Chuyển DTO B-C-2 → draft UI. Dùng cho target UI sau khi B-C-2 publish.
 * Không gọi API; chỉ map dữ liệu đã nhận.
 */
export function mapBc2TargetToTargetDraft(dto: Bc2TargetDto): Bc2MappingResult<TargetDraftInput> {
  const mapped = mapBc2TargetToS3(dto);
  if (!mapped.value) return { value: null, issues: mapped.issues };

  const target = mapped.value;
  return {
    value: {
      id: dto.id,
      metricId: dto.metricId,
      classificationId: dto.classificationId ?? "",
      labelCode: target.labelCode ?? "",
      label: dto.label ?? target.labelCode ?? dto.comparisonKind,
      periodType: target.periodType,
      year: target.year,
      periodNo: target.periodNo,
      value: String(target.value),
      unitType: target.unitType,
      direction: target.direction,
      sourceNote: target.sourceNote ?? "",
      note: dto.note ?? "",
      status: target.status,
      isOfficial: target.isOfficial === true,
    },
    issues: mapped.issues,
  };
}

/**
 * Payload tối thiểu để S3 target-only service gửi B-C-2 khi tạo DRAFT.
 * Service thật sẽ bổ sung quyền/audit/revision; hàm này chỉ map field.
 */
export interface Bc2TargetCreateInput {
  metricId: string;
  classificationId: string;
  comparisonKind: Bc2ComparisonKind;
  periodType: "YEAR" | "QUARTER" | "MONTH";
  year: number;
  periodNo: number | null;
  valueBase: number;
  unitType: string;
  dataSource: Bc2DataSource;
  status: "PROPOSED";
  direction: Direction;
  measureMode: MeasureMode;
  baselineScope: BaselineScope;
  sourceNote: string;
  note: string;
}

export interface Bc2TargetCreateContext {
  unitType: string;
  measureMode?: MeasureMode | null;
  baselineScope?: BaselineScope | null;
}

export function mapTargetDraftToBc2CreateInput(
  draft: TargetDraftInput,
  context: Bc2TargetCreateContext
): Bc2MappingResult<Bc2TargetCreateInput> {
  const issues: Bc2MappingIssue[] = [];
  const comparisonKind = mapLabelCodeToComparisonKind(draft.labelCode);
  if (!comparisonKind) {
    issues.push(
      issue(
        "labelCode",
        "COMPARISON_KIND_UNSUPPORTED",
        `labelCode ${draft.labelCode || "(trống)"} chưa có comparisonKind B-C-2 tương ứng.`
      )
    );
  }

  const value = parseMetricInput(draft.value);
  if (value === null) issues.push(issue("value", "VALUE_INVALID", "Giá trị không hợp lệ."));
  if (value !== null && value < 0) issues.push(issue("value", "VALUE_NEGATIVE", "Giá trị không được âm."));
  if (draft.unitType !== context.unitType) {
    issues.push(issue("unitType", "UNIT_MISMATCH", "Đơn vị không khớp metric."));
  }
  if (!draft.year) issues.push(issue("year", "YEAR_INVALID", "Thiếu năm."));

  if (!comparisonKind || value === null || value < 0 || draft.unitType !== context.unitType || !draft.year) {
    return { value: null, issues };
  }

  return {
    value: {
      metricId: draft.metricId,
      classificationId: draft.classificationId,
      comparisonKind,
      periodType: draft.periodType,
      year: draft.year,
      periodNo: draft.periodNo,
      valueBase: value,
      unitType: draft.unitType,
      dataSource: draft.isOfficial ? "REAL" : "DEMO",
      status: "PROPOSED",
      direction: draft.direction,
      measureMode: mapMeasureMode(context.measureMode),
      baselineScope: mapBaselineScope(context.baselineScope),
      sourceNote: draft.sourceNote,
      note: draft.note,
    },
    issues,
  };
}
