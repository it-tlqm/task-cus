/**
 * S3 — Phase C: executable proposal cho contract YC-06/07.
 *
 * ĐÂY KHÔNG PHẢI LOGIC PRODUCTION.
 * - Không import DB/API, không đọc/ghi dữ liệu.
 * - Chỉ là mock/pure functions + fixture để S0/S2 chốt contract.
 * - Các nhãn/trạng thái là ĐỀ XUẤT, chưa được duyệt.
 *
 * Chạy:
 *   npx tsx scripts/test-phase-c-contract-proposal.ts
 */

type DataState =
  | "CHUA_NHAP"
  | "DA_NHAP"
  | "DA_XAC_NHAN"
  | "DA_CHOT"
  | "KHONG_PHAT_SINH"
  | "KHONG_AP_DUNG";

type Coverage = "DU_KY" | "THIEU_KY" | "KHONG_XAC_DINH";

type TargetState = "KHONG_AP_DUNG" | "CHUA_GIAO" | "DA_GIAO_NHAP" | "DA_XAC_NHAN" | "DA_CHOT";

type Direction = "CAO_HON_TOT" | "THAP_HON_TOT" | "TRUNG_TINH" | "CHUA_CHOT";

type PercentReason =
  | "KHONG_AP_DUNG"
  | "THIEU_CHI_TIEU"
  | "CHI_TIEU_CHUA_XAC_NHAN"
  | "MAU_SO_BANG_0"
  | "CHI_TIEU_AM"
  | "THIEU_THUC_HIEN"
  | "THUC_HIEN_CHUA_DU_KY"
  | "THUC_HIEN_CHUA_XAC_NHAN"
  | "THIEU_PHAN_LOAI"
  | "LECH_DON_VI"
  | "LECH_PHAM_VI"
  | "CHUA_CO_QUY_TAC_CHIEU";

interface Entry {
  slotKey: string;
  value: number;
  status: "DRAFT" | "RECORDED" | "SUBMITTED" | "CONFIRMED" | "NEEDS_FIX";
}

interface ActualInput {
  applicable: boolean;
  locked: boolean;
  noActivityConfirmed: boolean;
  expectedSlots: number;
  entries: Entry[];
  /** true nếu chỉ tiêu có phân loại và mọi phân loại bắt buộc đều có dữ liệu. */
  classificationComplete: boolean;
  unitType: string;
  valueKind: "FLOW" | "BALANCE" | "DERIVED";
}

interface TargetInput {
  applicable: boolean;
  exists: boolean;
  status: "DRAFT" | "CONFIRMED" | "LOCKED";
  year: number;
  periodType: "YEAR" | "QUARTER" | "MONTH";
  periodNo: number | null;
  value: number;
  unitType: string;
  direction: Direction;
}

interface Period {
  year: number;
  periodType: "YEAR" | "QUARTER" | "MONTH";
  periodNo: number | null;
}

interface ActualResult {
  state: DataState;
  coverage: Coverage;
  coveredSlots: number;
  expectedSlots: number;
  totalValue: number | null;
  /** Số bản ghi có giá trị 0 (đã nhập) — khác với "chưa nhập". */
  zeroEntries: number;
  classificationComplete: boolean;
  reasons: string[];
}

interface TargetResult {
  state: TargetState;
  matchesPeriod: boolean;
  reason?: string;
}

interface PercentResult {
  state: "TINH_DUOC" | "KHONG_TINH";
  value: number | null;
  reason?: PercentReason;
  /** Chỉ có ý nghĩa khi state=TINH_DUOC. */
  displayValue: string | null;
  provisional: boolean;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function deriveActual(input: ActualInput): ActualResult {
  const reasons: string[] = [];
  const distinctSlots = new Set(input.entries.map((e) => e.slotKey));
  const coveredSlots = distinctSlots.size;
  const totalValue = input.entries.length
    ? input.entries.reduce((acc, e) => acc + e.value, 0)
    : null;
  const zeroEntries = input.entries.filter((e) => e.value === 0).length;

  if (!input.applicable) {
    return {
      state: "KHONG_AP_DUNG",
      coverage: "KHONG_XAC_DINH",
      coveredSlots,
      expectedSlots: input.expectedSlots,
      totalValue: null,
      zeroEntries,
      classificationComplete: input.classificationComplete,
      reasons: ["KHONG_THUOC_PHAM_VI"],
    };
  }

  let coverage: Coverage;
  if (input.expectedSlots <= 0) coverage = "KHONG_XAC_DINH";
  else if (coveredSlots >= input.expectedSlots) coverage = "DU_KY";
  else coverage = "THIEU_KY";

  if (input.noActivityConfirmed) {
    reasons.push("CO_XAC_NHAN_KHONG_PHAT_SINH");
    return {
      state: "KHONG_PHAT_SINH",
      coverage: input.expectedSlots <= 0 ? "KHONG_XAC_DINH" : "DU_KY",
      coveredSlots,
      expectedSlots: input.expectedSlots,
      totalValue: 0,
      zeroEntries,
      classificationComplete: input.classificationComplete,
      reasons,
    };
  }

  if (input.entries.length === 0) {
    reasons.push("KHONG_CO_BAN_GHI");
    return {
      state: "CHUA_NHAP",
      coverage,
      coveredSlots,
      expectedSlots: input.expectedSlots,
      totalValue: null,
      zeroEntries,
      classificationComplete: input.classificationComplete,
      reasons,
    };
  }

  if (coverage === "THIEU_KY") reasons.push("THIEU_SLOT_DU_KIEN");
  if (!input.classificationComplete) reasons.push("THIEU_PHAN_LOAI");

  if (input.locked) reasons.push("DA_CO_PHIEN_BAN_BAO_CAO");
  if (input.entries.every((e) => e.status === "CONFIRMED")) reasons.push("TAT_CA_BAN_GHI_DA_XAC_NHAN");
  if (input.entries.some((e) => e.status !== "CONFIRMED")) reasons.push("CON_BAN_GHI_CHUA_XAC_NHAN");

  let state: DataState;
  if (input.locked) state = "DA_CHOT";
  else if (input.entries.every((e) => e.status === "CONFIRMED")) state = "DA_XAC_NHAN";
  else state = "DA_NHAP";

  return {
    state,
    coverage,
    coveredSlots,
    expectedSlots: input.expectedSlots,
    totalValue,
    zeroEntries,
    classificationComplete: input.classificationComplete,
    reasons,
  };
}

function periodKey(p: Period): string {
  if (p.periodType === "YEAR") return `YEAR/${p.year}`;
  return `${p.periodType}/${p.periodNo}/${p.year}`;
}

function deriveTarget(target: TargetInput, period: Period): TargetResult {
  if (!target.applicable) return { state: "KHONG_AP_DUNG", matchesPeriod: false, reason: "KHONG_THUOC_PHAM_VI" };
  if (!target.exists) return { state: "CHUA_GIAO", matchesPeriod: false, reason: "KHONG_CO_CHI_TIEU" };

  const matchesPeriod =
    target.year === period.year &&
    target.periodType === period.periodType &&
    (target.periodType === "YEAR" ? target.periodNo === null : target.periodNo === period.periodNo);

  if (!matchesPeriod) {
    return {
      state: "CHUA_GIAO",
      matchesPeriod: false,
      reason: `CHI_TIEU_KHAC_KY:${periodKey({ year: target.year, periodType: target.periodType, periodNo: target.periodNo })}`,
    };
  }

  if (target.status === "DRAFT") return { state: "DA_GIAO_NHAP", matchesPeriod: true };
  if (target.status === "CONFIRMED") return { state: "DA_XAC_NHAN", matchesPeriod: true };
  return { state: "DA_CHOT", matchesPeriod: true };
}

interface PercentPolicy {
  /** Bắt buộc chỉ tiêu giao phải CONFIRMED/LOCKED mới tính chính thức. */
  requireConfirmedTarget: boolean;
  /** Bắt buộc dữ liệu thực hiện phải đủ kỳ (nếu xác định được kỳ). */
  requireCompleteActual: boolean;
  /**
   * Bắt buộc dữ liệu thực hiện phải CONFIRMED nếu chỉ tiêu bật requireConfirm.
   * Nếu false, bản ghi RECORDED vẫn được coi là hợp lệ (chỉ tiêu không bật kiểm tra).
   */
  metricRequiresConfirm: boolean;
}

function computePercent(
  actual: ActualResult,
  target: TargetResult,
  targetValue: number,
  targetUnit: string,
  direction: Direction,
  actualUnit: string,
  policy: PercentPolicy
): PercentResult {
  if (actual.state === "KHONG_AP_DUNG" || target.state === "KHONG_AP_DUNG") {
    return { state: "KHONG_TINH", value: null, reason: "KHONG_AP_DUNG", displayValue: null, provisional: false };
  }
  if (target.state === "CHUA_GIAO") {
    return { state: "KHONG_TINH", value: null, reason: "THIEU_CHI_TIEU", displayValue: null, provisional: false };
  }
  if (policy.requireConfirmedTarget && target.state === "DA_GIAO_NHAP") {
    return { state: "KHONG_TINH", value: null, reason: "CHI_TIEU_CHUA_XAC_NHAN", displayValue: null, provisional: false };
  }
  if (targetValue < 0) {
    return { state: "KHONG_TINH", value: null, reason: "CHI_TIEU_AM", displayValue: null, provisional: false };
  }
  if (targetValue === 0) {
    return { state: "KHONG_TINH", value: null, reason: "MAU_SO_BANG_0", displayValue: null, provisional: false };
  }
  if (actual.totalValue === null) {
    return { state: "KHONG_TINH", value: null, reason: "THIEU_THUC_HIEN", displayValue: null, provisional: false };
  }
  if (policy.requireCompleteActual && actual.coverage === "THIEU_KY") {
    return { state: "KHONG_TINH", value: null, reason: "THUC_HIEN_CHUA_DU_KY", displayValue: null, provisional: false };
  }
  if (!actual.classificationComplete) {
    return { state: "KHONG_TINH", value: null, reason: "THIEU_PHAN_LOAI", displayValue: null, provisional: false };
  }
  if (policy.metricRequiresConfirm && actual.state === "DA_NHAP") {
    return { state: "KHONG_TINH", value: null, reason: "THUC_HIEN_CHUA_XAC_NHAN", displayValue: null, provisional: false };
  }
  if (actualUnit !== targetUnit) {
    return { state: "KHONG_TINH", value: null, reason: "LECH_DON_VI", displayValue: null, provisional: false };
  }
  if (direction === "CHUA_CHOT" || direction === "THAP_HON_TOT") {
    // Chưa có quy tắc C1 cho chiều đánh giá. Không tự biến thành % đạt/vượt.
    return { state: "KHONG_TINH", value: null, reason: "CHUA_CO_QUY_TAC_CHIEU", displayValue: null, provisional: false };
  }

  const value = round2((actual.totalValue / targetValue) * 100);
  return {
    state: "TINH_DUOC",
    value,
    displayValue: `${value.toFixed(2)}%`,
    provisional: actual.state === "DA_NHAP",
  };
}

/**
 * Đề xuất gộp phân loại: KHÔNG coi phân loại thiếu là 0.
 * Trả tổng của các phân loại có dữ liệu, kèm cờ đầy đủ.
 */
function aggregateClassifications(rows: { id: string; value: number | null }[]): {
  total: number | null;
  complete: boolean;
  missing: string[];
} {
  if (rows.length === 0) return { total: null, complete: true, missing: [] };
  const missing = rows.filter((r) => r.value === null).map((r) => r.id);
  const present = rows.filter((r) => r.value !== null) as { id: string; value: number }[];
  if (present.length === 0) return { total: null, complete: false, missing };
  return { total: present.reduce((a, r) => a + r.value, 0), complete: missing.length === 0, missing };
}

// ============================================================
// FIXTURES + CHECKS
// ============================================================

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
const OK_ACTUAL: ActualInput = {
  applicable: true,
  locked: false,
  noActivityConfirmed: false,
  expectedSlots: 5,
  entries: [1, 2, 3, 4, 5].map((v) => ({ slotKey: `d${v}`, value: 10, status: "RECORDED" })),
  classificationComplete: true,
  unitType: "COUNT",
  valueKind: "FLOW",
};
const OK_TARGET: TargetInput = {
  applicable: true,
  exists: true,
  status: "CONFIRMED",
  year: 2026,
  periodType: "MONTH",
  periodNo: 10,
  value: 100,
  unitType: "COUNT",
  direction: "CAO_HON_TOT",
};
const POLICY: PercentPolicy = {
  requireConfirmedTarget: true,
  requireCompleteActual: true,
  metricRequiresConfirm: false,
};

function actualOf(patch: Partial<ActualInput>): ActualResult {
  return deriveActual({ ...OK_ACTUAL, ...patch });
}
function targetOf(patch: Partial<TargetInput>): TargetResult {
  return deriveTarget({ ...OK_TARGET, ...patch }, PERIOD);
}
function percentOf(
  actual: ActualResult,
  target: TargetResult,
  opts?: {
    targetValue?: number;
    targetUnit?: string;
    direction?: Direction;
    actualUnit?: string;
    policy?: Partial<PercentPolicy>;
  }
): PercentResult {
  return computePercent(
    actual,
    target,
    opts?.targetValue ?? 100,
    opts?.targetUnit ?? "COUNT",
    opts?.direction ?? "CAO_HON_TOT",
    opts?.actualUnit ?? "COUNT",
    { ...POLICY, ...(opts?.policy || {}) }
  );
}

console.log("\n[A] TRẠNG THÁI DỮ LIỆU (YC-06)");
check("A1. Không có bản ghi → CHUA_NHAP (không phải 0)", actualOf({ entries: [] }).state === "CHUA_NHAP");
check("A2. Có xác nhận không phát sinh → KHONG_PHAT_SINH", actualOf({ entries: [], noActivityConfirmed: true }).state === "KHONG_PHAT_SINH");
check("A3. Nhập 0 chưa xác nhận → DA_NHAP, KHÔNG phải KHONG_PHAT_SINH", actualOf({ entries: [{ slotKey: "d1", value: 0, status: "RECORDED" }], expectedSlots: 1 }).state === "DA_NHAP");
check("A4. Nhập 0 đã xác nhận đủ kỳ → KHONG_PHAT_SINH", actualOf({ entries: [{ slotKey: "d1", value: 0, status: "CONFIRMED" }], expectedSlots: 1, noActivityConfirmed: true }).state === "KHONG_PHAT_SINH");
check("A5. Có bản ghi chưa xác nhận → DA_NHAP", actualOf({}).state === "DA_NHAP");
check("A6. Tất cả bản ghi CONFIRMED → DA_XAC_NHAN", actualOf({ entries: OK_ACTUAL.entries.map((e) => ({ ...e, status: "CONFIRMED" as const })) }).state === "DA_XAC_NHAN");
check("A7. Có phiên bản báo cáo → DA_CHOT (ưu tiên cao nhất sau N/A)", actualOf({ locked: true }).state === "DA_CHOT");
check("A8. Không áp dụng → KHONG_AP_DUNG", actualOf({ applicable: false }).state === "KHONG_AP_DUNG");
check("A9. Thiếu 3/5 slot → coverage THIEU_KY", actualOf({ entries: OK_ACTUAL.entries.slice(0, 2) }).coverage === "THIEU_KY");
check("A10. Đủ 5/5 slot → coverage DU_KY", actualOf({}).coverage === "DU_KY");
check("A11. Không xác định được số slot → coverage KHONG_XAC_DINH", actualOf({ expectedSlots: 0 }).coverage === "KHONG_XAC_DINH");
check("A12. 0 đã nhập vẫn đếm là bản ghi (zeroEntries)", actualOf({ entries: [{ slotKey: "d1", value: 0, status: "RECORDED" }], expectedSlots: 1 }).zeroEntries === 1);

console.log("\n[B] TRẠNG THÁI CHỈ TIÊU GIAO (YC-07)");
check("B1. Không có chỉ tiêu → CHUA_GIAO", targetOf({ exists: false }).state === "CHUA_GIAO");
check("B2. Chỉ tiêu nháp → DA_GIAO_NHAP", targetOf({ status: "DRAFT" }).state === "DA_GIAO_NHAP");
check("B3. Chỉ tiêu đã xác nhận → DA_XAC_NHAN", targetOf({ status: "CONFIRMED" }).state === "DA_XAC_NHAN");
check("B4. Chỉ tiêu đã khóa → DA_CHOT", targetOf({ status: "LOCKED" }).state === "DA_CHOT");
check("B5. Chỉ tiêu khác năm → không khớp kỳ", targetOf({ year: 2025 }).matchesPeriod === false);
check("B6. Chỉ tiêu tháng 9, kỳ đang xem tháng 10 → không khớp", targetOf({ periodNo: 9 }).matchesPeriod === false);
check("B7. Chỉ tiêu quý không dùng cho kỳ tháng → không khớp", targetOf({ periodType: "QUARTER", periodNo: 4 }).matchesPeriod === false);
check("B8. Không áp dụng → KHONG_AP_DUNG", targetOf({ applicable: false }).state === "KHONG_AP_DUNG");

console.log("\n[C] TỶ LỆ THỰC HIỆN (YC-07)");
const fullRecorded = actualOf({});
const fullConfirmed = actualOf({ entries: OK_ACTUAL.entries.map((e) => ({ ...e, status: "CONFIRMED" as const })) });
const confirmedTarget = targetOf({});

check("C1. Thiếu chỉ tiêu → không tính, reason THIEU_CHI_TIEU", percentOf(fullRecorded, targetOf({ exists: false })).reason === "THIEU_CHI_TIEU");
check("C2. Chỉ tiêu nháp + yêu cầu xác nhận → không tính", percentOf(fullRecorded, targetOf({ status: "DRAFT" })).reason === "CHI_TIEU_CHUA_XAC_NHAN");
check("C3. Mẫu số 0 → không tính, KHÔNG trả 0%", percentOf(fullRecorded, confirmedTarget, { targetValue: 0 }).reason === "MAU_SO_BANG_0");
check("C4. Mẫu số âm → không tính", percentOf(fullRecorded, confirmedTarget, { targetValue: -1 }).reason === "CHI_TIEU_AM");
check("C5. Thiếu dữ liệu thực hiện → không tính", percentOf(actualOf({ entries: [] }), confirmedTarget).reason === "THIEU_THUC_HIEN");
check("C6. Thực hiện thiếu kỳ → không tính (mặc định chính thức)", percentOf(actualOf({ entries: OK_ACTUAL.entries.slice(0, 2) }), confirmedTarget).reason === "THUC_HIEN_CHUA_DU_KY");
const c7 = percentOf(fullRecorded, confirmedTarget, { policy: { metricRequiresConfirm: true } });
check("C7. Thực hiện chưa xác nhận + chỉ tiêu bật kiểm tra → không tính", c7.reason === "THUC_HIEN_CHUA_XAC_NHAN", c7);
const c8 = percentOf(fullRecorded, confirmedTarget);
check("C8. Thực hiện chưa xác nhận + chỉ tiêu không bật kiểm tra → tính tạm", c8.state === "TINH_DUOC" && c8.provisional === true, c8);
const c9 = percentOf(actualOf({ entries: [{ slotKey: "d1", value: 0, status: "CONFIRMED" }], expectedSlots: 1, noActivityConfirmed: true }), confirmedTarget);
check("C9. Thực hiện 0 đã xác nhận + chỉ tiêu 100 → 0.00%", c9.state === "TINH_DUOC" && c9.value === 0 && c9.displayValue === "0.00%", c9);
const c10 = percentOf(actualOf({ entries: [{ slotKey: "d1", value: 1, status: "CONFIRMED" }], expectedSlots: 1 }), confirmedTarget, { targetValue: 3 });
check("C10. 1/3 → 33.33% (2 chữ số thập phân)", c10.value === 33.33 && c10.displayValue === "33.33%", c10);
const c11 = percentOf(actualOf({ entries: [{ slotKey: "d1", value: 120, status: "CONFIRMED" }], expectedSlots: 1 }), confirmedTarget, { targetValue: 100 });
check("C11. 120/100 → 120.00%", c11.value === 120 && c11.displayValue === "120.00%", c11);
const c12 = percentOf(fullConfirmed, confirmedTarget, { actualUnit: "VND" });
check("C12. Lệch đơn vị → không tính", c12.reason === "LECH_DON_VI", c12);
const c13 = percentOf(fullConfirmed, confirmedTarget, { direction: "THAP_HON_TOT" });
check("C13. Chiều 'thấp hơn tốt' chưa chốt → không tự tính đạt/vượt", c13.reason === "CHUA_CO_QUY_TAC_CHIEU", c13);
const c14 = percentOf(fullConfirmed, confirmedTarget, { direction: "CHUA_CHOT" });
check("C14. Chiều 'chưa chốt' → không tính", c14.reason === "CHUA_CO_QUY_TAC_CHIEU", c14);
check("C15. Chỉ tiêu khác kỳ → không tính", percentOf(fullConfirmed, targetOf({ periodNo: 9 })).reason === "THIEU_CHI_TIEU");
const c16 = percentOf(actualOf({ locked: true }), confirmedTarget);
check("C16. Dữ liệu đã khóa báo cáo → vẫn tính được tỷ lệ chính thức", c16.state === "TINH_DUOC" && c16.value === 50, c16);
check("C17. thiếu phân loại → không tính", percentOf(actualOf({ classificationComplete: false }), confirmedTarget).reason === "THIEU_PHAN_LOAI");
check("C18. Không áp dụng → không tính", percentOf(actualOf({ applicable: false }), confirmedTarget).reason === "KHONG_AP_DUNG");

console.log("\n[D] GỘP PHÂN LOẠI — KHÔNG COI THIẾU = 0");
const aggPartial = aggregateClassifications([{ id: "O_TO", value: 10 }, { id: "THAN_COC", value: null }]);
const aggFull = aggregateClassifications([{ id: "O_TO", value: 10 }, { id: "THAN_COC", value: 5 }]);
const aggEmpty = aggregateClassifications([{ id: "O_TO", value: null }, { id: "THAN_COC", value: null }]);
check("D1. Một phân loại thiếu → tổng chỉ cộng phần có, complete=false", aggPartial.total === 10 && aggPartial.complete === false);
check("D2. Một phân loại thiếu → ghi nhận đúng mã thiếu", aggPartial.missing.includes("THAN_COC"));
check("D3. Đủ phân loại → complete=true", aggFull.total === 15 && aggFull.complete === true);
check("D4. Tất cả phân loại thiếu → total=null, không trả 0", aggEmpty.total === null && aggEmpty.complete === false);
check("D5. Thiếu phân loại chặn tỷ lệ tổng", percentOf(actualOf({ classificationComplete: aggPartial.complete }), confirmedTarget).reason === "THIEU_PHAN_LOAI");

console.log("\n[E] TỔNG HỢP");
console.log(`PASS ${passed}/${passed + failed}, FAIL ${failed}`);
if (failed > 0) {
  console.log("Failures:", failures.join(" | "));
  process.exitCode = 1;
}
