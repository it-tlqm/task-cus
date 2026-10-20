/**
 * YC-33 — Lớp đọc dữ liệu + tổng hợp điểm theo kỳ.
 *
 * NGUYÊN TẮC:
 * - Nguồn điểm là `monthly_work_results` (kết quả tháng) — mỗi đầu việc tính ĐÚNG 1 LẦN.
 *   Cùng một công việc xuất hiện ở kế hoạch / nhật ký / kết quả tháng vẫn chỉ tính 1 lần
 *   (khớp theo workItemId, sau đó theo taskId).
 * - Hệ số TX (Danh mục TX1) và hệ số QĐ1277 (sản phẩm) là HAI nguồn KHÁC NHAU:
 *   ghi rõ `factorSource`; KHÔNG tự dùng hệ số TX cho sản phẩm QĐ1277 và ngược lại.
 * - Hệ số đã chốt trong `monthly_work_results.factor_snapshot` được ưu tiên khi có
 *   (không tính lại kết quả đã chốt khi hệ số danh mục thay đổi).
 * - Thiếu căn cứ → trạng thái rõ ràng, KHÔNG tạo điểm giả.
 */

import { prisma } from "../db";
import {
  computeBang1,
  BANG1_FORMULA_VERSION,
  type FactorSource,
  type ScoreResult,
  type ScoreRowInput,
} from "./bang1";

export type PeriodType = "MONTH" | "QUARTER";

export interface ScoreComputation extends ScoreResult {
  personId: string;
  periodType: PeriodType;
  periodYear: number;
  periodNumber: number;
  /** Bản ghi kết quả đã chốt trước đó (nếu có) — không tính lại. */
  confirmedRun: { id: string; status: string; overallScore: number | null; computedAt: Date } | null;
  /** Ghi chú bổ sung (ví dụ: kỳ đã khóa, có bản ghi chốt sẵn). */
  notes: string[];
  /** Danh sách kỳ đã chốt số (snapshot) — không cho ghi mới. */
  periodLocked: boolean;
}

function monthsOfQuarter(quarter: number): number[] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

/**
 * Tính điểm cho một người trong một kỳ (tháng hoặc quý).
 * Hàm đọc DB — không ghi gì.
 */
export async function computeScoreForPeriod(params: {
  personId: string;
  periodType: PeriodType;
  periodYear: number;
  periodNumber: number;
  /** Bỏ qua bản ghi kết quả đã chốt (chỉ dùng khi tính lại khi danh mục đổi). */
  includeConfirmed?: boolean;
}): Promise<ScoreComputation> {
  const { personId, periodType, periodYear, periodNumber } = params;
  const notes: string[] = [];

  const monthFilter =
    periodType === "QUARTER" ? { in: monthsOfQuarter(periodNumber) } : periodNumber;

  const results = await prisma.monthlyWorkResult.findMany({
    where: {
      personId,
      periodYear,
      periodMonth: monthFilter as any,
    },
    include: {
      workItem: {
        include: {
          catalogEntry: {
            include: { version: { select: { id: true, code: true, status: true } } },
          },
        },
      },
      productItem: {
        include: { version: { select: { id: true, code: true, status: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Bản ghi kết quả đã chốt (snapshot) — không tự tính lại.
  const confirmedRun = await prisma.scoreRun.findFirst({
    where: {
      personId,
      periodType,
      periodYear,
      periodNumber,
      formulaVersion: BANG1_FORMULA_VERSION,
      status: "CONFIRMED",
    },
    orderBy: { computedAt: "desc" },
    select: { id: true, status: true, overallScore: true, computedAt: true },
  });
  if (confirmedRun) {
    notes.push(
      "Kỳ này đã có bản điểm chốt — hệ thống KHÔNG tự tính lại để tránh lệch với kết quả đã trình ký."
    );
  }

  // Kỳ đã khóa?
  const periodIds = [
    ...new Set(
      results
        .map((r) => r.workItem?.periodId)
        .filter((x): x is string => !!x)
    ),
  ];
  const periods = periodIds.length
    ? await prisma.reportingPeriod.findMany({
        where: { id: { in: periodIds } },
        select: { id: true, isLocked: true, title: true },
      })
    : [];
  const periodLocked = periods.some((p) => p.isLocked);
  if (periodLocked) {
    notes.push("Kỳ công tác đã khóa (đã chốt số) — không ghi thêm kết quả tính điểm.");
  }

  const rows: ScoreRowInput[] = [];
  const skipped: string[] = [];
  const seenWorkItem = new Set<string>();
  const seenTask = new Set<string>();

  for (const r of results) {
    // Chống tính trùng: cùng đầu việc / cùng nhiệm vụ chỉ tính 1 lần.
    if (r.workItemId) {
      if (seenWorkItem.has(r.workItemId)) {
        skipped.push(`Bỏ qua bản ghi kết quả trùng đầu việc: "${r.title}"`);
        continue;
      }
      seenWorkItem.add(r.workItemId);
    }
    if (r.taskId) {
      if (seenTask.has(r.taskId)) {
        skipped.push(`Bỏ qua bản ghi kết quả trùng nhiệm vụ: "${r.title}"`);
        continue;
      }
      seenTask.add(r.taskId);
    }

    let factor: number | null = null;
    let factorSource: FactorSource = "MISSING";

    if (r.productItemId && r.productItem) {
      // Sản phẩm QĐ1277 — hệ số RIÊNG, không dùng hệ số TX.
      factorSource = "QD1277_PRODUCT";
      factor =
        r.productItem.convertFactor === null || r.productItem.convertFactor === undefined
          ? null
          : Number(r.productItem.convertFactor);
      if (r.productItem.version?.status !== "ACTIVE") {
        factorSource = "PENDING_RULE";
        factor = null;
      }
    } else if (r.workItem?.catalogEntry) {
      // Đầu việc Danh mục TX — hệ số RIÊNG, không dùng hệ số QĐ1277.
      factorSource = "TX_CATALOG";
      const ce = r.workItem.catalogEntry;
      factor =
        ce.convertFactor === null || ce.convertFactor === undefined
          ? null
          : Number(ce.convertFactor);
      if (ce.version?.status !== "ACTIVE") {
        factorSource = "PENDING_RULE";
        factor = null;
      }
    } else if (r.factorSnapshot !== null && r.factorSnapshot !== undefined) {
      // Hệ số đã chốt tại thời điểm ghi kết quả — giữ nguyên lịch sử.
      factorSource = "MANUAL";
      factor = Number(r.factorSnapshot);
    }

    // Số ngày chậm tiến độ — theo công thức gốc K = J − C (ngày hoàn thành − ngày hết hạn).
    let lateDays = r.lateCount || 0;
    if (r.dueDate && r.completedDate) {
      const diff = daysBetween(r.dueDate, r.completedDate);
      lateDays = diff > 0 ? diff : 0;
    }

    rows.push({
      id: r.id,
      title: r.title,
      factor,
      factorSource,
      assignedQty: r.assignedQty === null || r.assignedQty === undefined ? null : r.assignedQty,
      completedQty:
        r.completedQty === null || r.completedQty === undefined ? null : r.completedQty,
      lateDays,
      reworkCount: r.reworkCount || 0,
    });
  }

  const computed = computeBang1(rows);
  const allReasons = [...computed.reasons, ...skipped, ...notes];

  return {
    ...computed,
    reasons: allReasons,
    personId,
    periodType,
    periodYear,
    periodNumber,
    confirmedRun,
    notes,
    periodLocked,
  };
}

/**
 * Lưu snapshot kết quả tính điểm (bản DRAFT hoặc CONFIRMED).
 * Không ghi đè bản đã CONFIRMED.
 */
export async function saveScoreRun(params: {
  personId: string;
  periodType: PeriodType;
  periodYear: number;
  periodNumber: number;
  computation: ScoreComputation;
  computedById: string | null;
  status: "DRAFT" | "CONFIRMED";
  productVersionId?: string | null;
  catalogVersionId?: string | null;
}) {
  const { personId, periodType, periodYear, periodNumber, computation, status } = params;

  const existingConfirmed = await prisma.scoreRun.findFirst({
    where: {
      personId,
      periodType,
      periodYear,
      periodNumber,
      formulaVersion: computation.formulaVersion,
      status: "CONFIRMED",
    },
    select: { id: true },
  });
  if (existingConfirmed && status === "CONFIRMED") {
    return { id: existingConfirmed.id, deduplicated: true as const };
  }

  const run = await prisma.scoreRun.upsert({
    where: {
      personId_periodType_periodYear_periodNumber_formulaVersion: {
        personId,
        periodType,
        periodYear,
        periodNumber,
        formulaVersion: computation.formulaVersion,
      },
    },
    create: {
      personId,
      periodType,
      periodYear,
      periodNumber,
      formulaVersion: computation.formulaVersion,
      productVersionId: params.productVersionId ?? null,
      catalogVersionId: params.catalogVersionId ?? null,
      status,
      overallScore: computation.ratios.d,
      summaryJson: computation.totals as any,
      reasonsJson: computation.reasons as any,
      computedById: params.computedById,
      computedAt: new Date(),
    },
    update: {
      status,
      productVersionId: params.productVersionId ?? null,
      catalogVersionId: params.catalogVersionId ?? null,
      overallScore: computation.ratios.d,
      summaryJson: computation.totals as any,
      reasonsJson: computation.reasons as any,
      computedById: params.computedById,
      computedAt: new Date(),
    },
  });

  // Ghi lại chi tiết từng dòng (snapshot đầy đủ để đối soát về sau).
  await prisma.scoreRunItem.deleteMany({ where: { scoreRunId: run.id } });
  if (computation.rows.length > 0) {
    await prisma.scoreRunItem.createMany({
      data: computation.rows.map((r, i) => ({
        scoreRunId: run.id,
        monthlyResultId: r.id,
        sequence: i,
        title: r.title,
        factorSource: r.factorSource,
        factor: r.factor,
        factorSnapshot: r.factorSource === "MANUAL" ? { value: r.factor } : undefined,
        assignedQty: r.assignedQty,
        completedQty: r.completedQty,
        lateDays: r.lateDays,
        reworkCount: r.reworkCount,
        gAssignedConverted: r.g,
        iCompletedConverted: r.i,
        lProgressConverted: r.l,
        nQualityConverted: r.n,
        status: r.status,
        reasons: r.reasons as any,
      })),
    });
  }

  return { id: run.id, deduplicated: false as const };
}
