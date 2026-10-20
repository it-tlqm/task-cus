/**
 * YC-33 — Tạo khối "điểm tính thử" cho màn hình Kết quả công tác tháng.
 *
 * Dùng bộ máy tính BẢNG 1 (decimal-safe) với trạng thái rõ ràng:
 *   KNOWN | INSUFFICIENT_DATA | PENDING_RULE | NOT_APPLICABLE | ERROR.
 *
 * Hệ số: sản phẩm QĐ1277 → productItem.convertFactor; đầu việc Danh mục TX →
 * catalogEntry.convertFactor; đã chốt → factorSnapshot. KHÔNG lấy lẫn hai nguồn.
 */

import { computeBang1, type FactorSource, type ScoreRowInput } from "./bang1";

export interface MonthlyScoreItemLike {
  id: string;
  title: string;
  workItemId?: string | null;
  taskId?: string | null;
  assignedQty?: number | null;
  completedQty?: number | null;
  dueDate?: Date | string | null;
  completedDate?: Date | string | null;
  lateCount?: number | null;
  reworkCount?: number | null;
  factorSnapshot?: number | null;
  productItem?: {
    convertFactor?: number | null;
    version?: { status?: string } | null;
  } | null;
  workItem?: {
    catalogEntry?: {
      convertFactor?: number | null;
      version?: { status?: string } | null;
    } | null;
  } | null;
}

export interface MonthlyScorePreview {
  qtyRatio: number | null;
  progressRatio: number | null;
  qualityRatio: number | null;
  averageD: number | null;
  score70: number | null;
  official: false;
  note: string;
  /** YC-33 */
  status: string;
  reasons: string[];
  rows: Array<{
    id: string;
    title: string;
    factor: number | null;
    factorSource: FactorSource;
    assignedQty: number | null;
    completedQty: number | null;
    lateDays: number;
    reworkCount: number;
    g: number | null;
    i: number | null;
    l: number | null;
    n: number | null;
    status: string;
    reasons: string[];
  }>;
  formulaVersion: string;
}

function daysBetween(a: Date | string, b: Date | string): number {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return Math.floor((db.getTime() - da.getTime()) / 86400000);
}

export function buildMonthlyScorePreview(
  items: MonthlyScoreItemLike[],
  _personId: string,
  _year: number,
  _month: number
): MonthlyScorePreview {
  const rows: ScoreRowInput[] = [];
  const seenWorkItem = new Set<string>();
  const seenTask = new Set<string>();
  const skipped: string[] = [];

  for (const it of items) {
    if (it.workItemId) {
      if (seenWorkItem.has(it.workItemId)) {
        skipped.push(`Bỏ qua bản ghi trùng đầu việc: "${it.title}"`);
        continue;
      }
      seenWorkItem.add(it.workItemId);
    }
    if (it.taskId) {
      if (seenTask.has(it.taskId)) {
        skipped.push(`Bỏ qua bản ghi trùng nhiệm vụ: "${it.title}"`);
        continue;
      }
      seenTask.add(it.taskId);
    }

    let factor: number | null = null;
    let factorSource: FactorSource = "MISSING";

    if (it.productItem) {
      factorSource = "QD1277_PRODUCT";
      factor =
        it.productItem.convertFactor === null || it.productItem.convertFactor === undefined
          ? null
          : Number(it.productItem.convertFactor);
      if (it.productItem.version?.status && it.productItem.version.status !== "ACTIVE") {
        factorSource = "PENDING_RULE";
        factor = null;
      }
    } else if (it.workItem?.catalogEntry) {
      factorSource = "TX_CATALOG";
      const ce = it.workItem.catalogEntry;
      factor =
        ce.convertFactor === null || ce.convertFactor === undefined ? null : Number(ce.convertFactor);
      if (ce.version?.status && ce.version.status !== "ACTIVE") {
        factorSource = "PENDING_RULE";
        factor = null;
      }
    } else if (it.factorSnapshot !== null && it.factorSnapshot !== undefined) {
      factorSource = "MANUAL";
      factor = Number(it.factorSnapshot);
    }

    let lateDays = it.lateCount || 0;
    if (it.dueDate && it.completedDate) {
      const diff = daysBetween(it.dueDate, it.completedDate);
      lateDays = diff > 0 ? diff : 0;
    }

    rows.push({
      id: it.id,
      title: it.title,
      factor,
      factorSource,
      assignedQty: it.assignedQty ?? null,
      completedQty: it.completedQty ?? null,
      lateDays,
      reworkCount: it.reworkCount || 0,
    });
  }

  const res = computeBang1(rows);

  const noteByStatus: Record<string, string> = {
    KNOWN:
      "Điểm tính theo công thức Bảng 1 (đã đối chiếu với mẫu gốc). Chỉ là điểm tính thử — chưa phải kết quả đánh giá chính thức.",
    INSUFFICIENT_DATA:
      "CHƯA ĐỦ CĂN CỨ — chưa tính được điểm. Xem lý do bên dưới và bổ sung số liệu/hệ số.",
    PENDING_RULE:
      "CHỜ QUY TẮC — chưa có quy tắc ánh xạ hệ số cho một số dòng, hệ thống KHÔNG tự suy diễn.",
    NOT_APPLICABLE:
      "Không áp dụng — kỳ này chưa có đủ dữ liệu quy đổi để tính điểm.",
    ERROR: "Lỗi tính toán — không phát sinh điểm.",
  };

  return {
    qtyRatio: res.ratios.a,
    progressRatio: res.ratios.b,
    qualityRatio: res.ratios.c,
    averageD: res.ratios.d,
    score70: res.ratios.score70,
    official: false,
    note: noteByStatus[res.status] || noteByStatus.INSUFFICIENT_DATA,
    status: res.status,
    reasons: [...res.reasons, ...skipped],
    rows: res.rows,
    formulaVersion: res.formulaVersion,
  };
}
