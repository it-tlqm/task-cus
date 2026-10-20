/**
 * YC-33 — Bộ máy tính điểm BẢNG 1 (thuần, decimal-safe).
 *
 * CÔNG THỨC — đối chiếu TRỰC TIẾP với workbook gốc
 * (`Dữ liệu.zip` → sheet "Bảng 1 (tính điểm CC)" của công chức tháng 9/2026):
 *
 *   (7)  G = (5) × (6)                     hệ số × số lượng giao
 *   (9)  I = (5) × (8)                     hệ số × số lượng hoàn thành thực tế
 *   (11) K = IF(J − C > 0; J − C; 0)       số ngày chậm tiến độ
 *   (12) L = (9) − (11) × 25% × (9)       số lượng hoàn thành đạt TIẾN ĐỘ quy đổi
 *   (14) N = (9) − (13) × 25% × (9)       số lượng hoàn thành đạt CHẤT LƯỢNG quy đổi
 *
 *   TỔNG CỘNG:  G19=ΣG, I19=ΣI, L19=ΣL, M19=ΣM, N19=ΣN
 *   I20 = (I19 / G19) × 100      Điểm (%) về SỐ LƯỢNG
 *   L20 = (L19 / G19) × 100      Điểm (%) về TIẾN ĐỘ
 *   N20 = (N19 / G19) × 100      Điểm (%) về CHẤT LƯỢNG
 *
 *   Biểu 01A (mẫu gốc):
 *   D34 = I20 · D35 = L20 · D36 = N20
 *   D37 = (D34 + D35 + D36) / 3        d — điểm kết quả thực hiện nhiệm vụ
 *   D38 = D37 × 70 / 100                điểm tiêu chí kết quả thực hiện nhiệm vụ
 *   D39 = D38 + C31                    tổng điểm (C31 = điểm tiêu chí chung, tối đa 30)
 *
 * NGUYÊN TẮC:
 * - Không tự bịa công thức/ngưỡng: thiếu dữ liệu → INSUFFICIENT_DATA, chưa có quy tắc
 *   → PENDING_RULE. KHÔNG coi giá trị thiếu là 0.
 * - Không cộng trùng: mỗi dòng công việc tính đúng 1 lần (nguồn định danh).
 * - Hệ số TX (Danh mục TX1) và hệ số QĐ1277 (sản phẩm) là HAI nguồn KHÁC NHAU:
 *   `factorSource` ghi rõ nguồn; không tự dùng hệ số TX cho sản phẩm QĐ1277.
 */

import {
  addFixed,
  divFixed,
  fromFixed,
  mulCount,
  mulFixed,
  mulPercent,
  subFixed,
  toFixed,
} from "./decimal";

export const BANG1_FORMULA_VERSION = "BANG1-v1.0";

export type ScoreStatus =
  | "KNOWN"
  | "INSUFFICIENT_DATA"
  | "PENDING_RULE"
  | "NOT_APPLICABLE"
  | "ERROR";

export type FactorSource =
  | "QD1277_PRODUCT"
  | "TX_CATALOG"
  | "MANUAL"
  | "MISSING"
  | "PENDING_RULE";

export interface ScoreRowInput {
  /** Định danh dòng công việc (id bản ghi nguồn) — dùng để chống tính trùng. */
  id: string;
  title: string;
  /** Hệ số quy đổi (đã chốt nguồn). */
  factor: number | null;
  /** Nguồn của hệ số — KHÔNG tự suy diễn. */
  factorSource: FactorSource;
  /** Số lượng giao. */
  assignedQty: number | null;
  /** Số lượng hoàn thành thực tế. */
  completedQty: number | null;
  /** Số ngày chậm tiến độ (K). */
  lateDays: number;
  /** Số lần yêu cầu làm lại (M). */
  reworkCount: number;
}

export interface ScoreRowResult {
  id: string;
  title: string;
  factor: number | null;
  factorSource: FactorSource;
  assignedQty: number | null;
  completedQty: number | null;
  lateDays: number;
  reworkCount: number;
  /** G — số lượng giao quy đổi */
  g: number | null;
  /** I — số lượng hoàn thành thực tế quy đổi */
  i: number | null;
  /** L — số lượng hoàn thành đạt tiến độ quy đổi */
  l: number | null;
  /** N — số lượng hoàn thành đạt chất lượng quy đổi */
  n: number | null;
  status: ScoreStatus;
  reasons: string[];
}

export interface ScoreTotals {
  g: number | null;
  h: number | null;
  i: number | null;
  l: number | null;
  m: number | null;
  n: number | null;
}

export interface ScoreRatios {
  /** a — Điểm (%) về số lượng */
  a: number | null;
  /** b — Điểm (%) về tiến độ */
  b: number | null;
  /** c — Điểm (%) về chất lượng */
  c: number | null;
  /** d — điểm kết quả thực hiện nhiệm vụ = (a+b+c)/3 */
  d: number | null;
  /** Điểm tiêu chí kết quả thực hiện nhiệm vụ = d*70/100 */
  score70: number | null;
}

export interface ScoreResult {
  status: ScoreStatus;
  reasons: string[];
  rows: ScoreRowResult[];
  totals: ScoreTotals;
  ratios: ScoreRatios;
  formulaVersion: string;
  /** Điểm có thể dùng để trình ký hay không (chỉ khi status = KNOWN). */
  official: boolean;
}

function emptyTotals(): ScoreTotals {
  return { g: null, h: null, i: null, l: null, m: null, n: null };
}

function emptyRatios(): ScoreRatios {
  return { a: null, b: null, c: null, d: null, score70: null };
}

const STATUS_SEVERITY: Record<ScoreStatus, number> = {
  KNOWN: 0,
  NOT_APPLICABLE: 1,
  PENDING_RULE: 2,
  INSUFFICIENT_DATA: 3,
  ERROR: 4,
};

function worst(a: ScoreStatus, b: ScoreStatus): ScoreStatus {
  return STATUS_SEVERITY[a] >= STATUS_SEVERITY[b] ? a : b;
}

/**
 * Tính điểm Bảng 1 cho một danh sách dòng công việc.
 * Hàm thuần: không đọc DB, không phụ thuộc thời gian, cùng đầu vào → cùng đầu ra.
 */
export function computeBang1(rows: ScoreRowInput[]): ScoreResult {
  const reasons: string[] = [];
  let overall: ScoreStatus = "KNOWN";

  // Chống tính trùng: mỗi id chỉ xuất hiện 1 lần (giữ lần đầu).
  const seen = new Set<string>();
  const deduped: ScoreRowInput[] = [];
  for (const r of rows) {
    if (!r.id) continue;
    if (seen.has(r.id)) {
      reasons.push(`Bỏ qua dòng bị lặp: "${r.title}" (đã có trong danh sách tính điểm)`);
      continue;
    }
    seen.add(r.id);
    deduped.push(r);
  }

  if (deduped.length === 0) {
    return {
      status: "NOT_APPLICABLE",
      reasons: ["Kỳ này không có công việc nào để tính điểm."],
      rows: [],
      totals: emptyTotals(),
      ratios: emptyRatios(),
      formulaVersion: BANG1_FORMULA_VERSION,
      official: false,
    };
  }

  const outRows: ScoreRowResult[] = [];
  let sumG = 0n;
  let sumH = 0n;
  let sumI = 0n;
  let sumL = 0n;
  let sumM = 0n;
  let sumN = 0n;
  let anyComputed = false;

  for (const row of deduped) {
    const rowReasons: string[] = [];
    let rowStatus: ScoreStatus = "KNOWN";

    if (row.factorSource === "PENDING_RULE") {
      rowReasons.push(
        "Chưa có quy tắc ánh xạ hệ số cho công việc này (chờ Hải quan xác nhận)."
      );
      rowStatus = worst(rowStatus, "PENDING_RULE");
    } else if (row.factor === null || row.factor === undefined) {
      rowReasons.push(
        row.factorSource === "MISSING"
          ? "Thiếu hệ số quy đổi — chưa xác định được nguồn (TX hay QĐ1277)."
          : "Thiếu hệ số quy đổi."
      );
      rowStatus = worst(rowStatus, "INSUFFICIENT_DATA");
    }

    if (row.assignedQty === null || row.assignedQty === undefined) {
      rowReasons.push("Thiếu số lượng giao.");
      rowStatus = worst(rowStatus, "INSUFFICIENT_DATA");
    }
    if (row.completedQty === null || row.completedQty === undefined) {
      rowReasons.push("Thiếu số lượng hoàn thành thực tế.");
      rowStatus = worst(rowStatus, "INSUFFICIENT_DATA");
    }
    if (!Number.isFinite(row.lateDays) || row.lateDays < 0) {
      rowReasons.push("Số ngày chậm tiến độ không hợp lệ.");
      rowStatus = worst(rowStatus, "ERROR");
    }
    if (!Number.isFinite(row.reworkCount) || row.reworkCount < 0) {
      rowReasons.push("Số lần yêu cầu làm lại không hợp lệ.");
      rowStatus = worst(rowStatus, "ERROR");
    }

    const E = toFixed(row.factor);
    const F = toFixed(row.assignedQty);
    const H = toFixed(row.completedQty);
    const K = BigInt(Math.trunc(row.lateDays || 0));
    const M = BigInt(Math.trunc(row.reworkCount || 0));

    let g: bigint | null = null;
    let i: bigint | null = null;
    let l: bigint | null = null;
    let n: bigint | null = null;

    if (rowStatus === "KNOWN" && E !== null && F !== null && H !== null) {
      g = mulFixed(E, F); // (7) = (5)*(6)
      i = mulFixed(E, H); // (9) = (5)*(8)
      // (12) = (9) - (11)*25%*(9)   — K là số đếm nguyên
      l = subFixed(i, mulPercent(mulCount(i, K), 25n));
      // (14) = (9) - (13)*25%*(9)   — M là số đếm nguyên
      n = subFixed(i, mulPercent(mulCount(i, M), 25n));
      sumG += g;
      sumH += H;
      sumI += i;
      sumL += l;
      sumM += M;
      sumN += n;
      anyComputed = true;
    }

    outRows.push({
      id: row.id,
      title: row.title,
      factor: row.factor ?? null,
      factorSource: row.factorSource,
      assignedQty: row.assignedQty ?? null,
      completedQty: row.completedQty ?? null,
      lateDays: row.lateDays || 0,
      reworkCount: row.reworkCount || 0,
      g: fromFixed(g),
      i: fromFixed(i),
      l: fromFixed(l),
      n: fromFixed(n),
      status: rowStatus,
      reasons: rowReasons,
    });

    overall = worst(overall, rowStatus);
  }

  if (!anyComputed) {
    const rowReasons = [...new Set(outRows.flatMap((r) => r.reasons))];
    return {
      status: overall === "KNOWN" ? "NOT_APPLICABLE" : overall,
      reasons: [
        ...reasons,
        ...rowReasons,
        "Không có dòng nào đủ căn cứ để tính điểm — không phát sinh điểm giả.",
      ],
      rows: outRows,
      totals: emptyTotals(),
      ratios: emptyRatios(),
      formulaVersion: BANG1_FORMULA_VERSION,
      official: false,
    };
  }

  // Tổng cộng (Bảng 1 dòng 19)
  const totals: ScoreTotals = {
    g: fromFixed(sumG),
    h: fromFixed(sumH),
    i: fromFixed(sumI),
    l: fromFixed(sumL),
    m: Number(sumM),
    n: fromFixed(sumN),
  };

  if (sumG <= 0n) {
    return {
      status: worst(overall, "NOT_APPLICABLE"),
      reasons: [
        ...reasons,
        "Tổng số lượng giao quy đổi bằng 0 — không chia được điểm (%) theo công thức Bảng 1.",
      ],
      rows: outRows,
      totals,
      ratios: emptyRatios(),
      formulaVersion: BANG1_FORMULA_VERSION,
      official: false,
    };
  }

  // I20 = (I19/G19)*100 ; L20 = (L19/G19)*100 ; N20 = (N19/G19)*100
  const a = divFixed(sumI * 100n, sumG);
  const b = divFixed(sumL * 100n, sumG);
  const c = divFixed(sumN * 100n, sumG);
  // d = (a+b+c)/3
  const d = divFixed(addFixed(addFixed(a, b), c), toFixed(3)!);
  // điểm tiêu chí kết quả thực hiện nhiệm vụ = d*70/100
  const score70 = mulPercent(d, 70n);

  const ratios: ScoreRatios = {
    a: fromFixed(a),
    b: fromFixed(b),
    c: fromFixed(c),
    d: fromFixed(d),
    score70: fromFixed(score70),
  };

  return {
    status: overall,
    reasons:
      overall === "KNOWN"
        ? reasons
        : [...reasons, ...new Set(outRows.flatMap((r) => r.reasons))],
    rows: outRows,
    totals,
    ratios,
    formulaVersion: BANG1_FORMULA_VERSION,
    official: overall === "KNOWN",
  };
}

/**
 * Tính tổng điểm theo mẫu 01A (tháng) — chỉ khi có điểm tiêu chí chung.
 *
 * D39 = D38 + C31, trong đó:
 *   D34 = a, D35 = b, D36 = c, D37 = (a+b+c)/3, D38 = D37*70/100
 *   C31 = điểm tiêu chí chung (tối đa 30) — do người dùng/người chấm nhập.
 */
export interface Form01AInput {
  ratios: ScoreRatios;
  /** Điểm tiêu chí chung (tối đa 30). */
  commonCriteriaScore: number | null;
  /** Trần điểm tiêu chí chung theo mẫu gốc. */
  commonCriteriaMax?: number;
}

export interface Form01AOutput {
  status: ScoreStatus;
  reasons: string[];
  /** D34 — a */
  d34: number | null;
  /** D35 — b */
  d35: number | null;
  /** D36 — c */
  d36: number | null;
  /** D37 — d */
  d37: number | null;
  /** D38 */
  d38: number | null;
  /** C31 */
  c31: number | null;
  /** D39 — tổng điểm */
  d39: number | null;
  formulaVersion: string;
}

export function computeForm01A(input: Form01AInput): Form01AOutput {
  const reasons: string[] = [];
  const max = input.commonCriteriaMax ?? 30;
  const base: Form01AOutput = {
    status: "KNOWN",
    reasons,
    d34: input.ratios.a,
    d35: input.ratios.b,
    d36: input.ratios.c,
    d37: input.ratios.d,
    d38: input.ratios.score70,
    c31: input.commonCriteriaScore,
    d39: null,
    formulaVersion: BANG1_FORMULA_VERSION,
  };

  if (input.ratios.d === null || input.ratios.score70 === null) {
    return {
      ...base,
      status: "INSUFFICIENT_DATA",
      reasons: [
        "Chưa có đủ căn cứ tính điểm kết quả thực hiện nhiệm vụ (a/b/c) — không lập được tổng điểm.",
      ],
    };
  }
  if (input.commonCriteriaScore === null) {
    return {
      ...base,
      status: "INSUFFICIENT_DATA",
      reasons: [
        "Chưa có điểm tiêu chí chung (tối đa 30 điểm) — chờ người chấm nhập.",
      ],
    };
  }
  const cc = toFixed(input.commonCriteriaScore);
  if (cc === null) {
    return {
      ...base,
      status: "ERROR",
      reasons: ["Điểm tiêu chí chung không hợp lệ."],
    };
  }
  if (cc < 0n || cc > toFixed(max)!) {
    return {
      ...base,
      status: "ERROR",
      reasons: [`Điểm tiêu chí chung phải trong khoảng 0…${max}.`],
    };
  }

  const d39 = addFixed(cc, toFixed(input.ratios.score70)!);
  return { ...base, status: "KNOWN", d39: fromFixed(d39) };
}

export { SCALE_DECIMALS } from "./decimal";
