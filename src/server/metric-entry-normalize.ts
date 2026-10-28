import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { metricInputMode } from "@/lib/metric-input-mode";

export type MetricEntryInputMode = "INCREMENTAL" | "CUMULATIVE";

function dayBefore(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - 1);
  return next;
}

/**
 * Quy đổi giá trị người dùng nhập về dạng lưu chuẩn của chỉ tiêu:
 * - Chỉ tiêu lưu phát sinh: nhập lũy kế thì trừ lũy kế đầu kỳ để ra phát sinh.
 * - Chỉ tiêu lưu lũy kế: nhập phát sinh thì cộng vào lũy kế đầu kỳ.
 */
export function normalizeEntryValue(input: {
  storageMode: MetricEntryInputMode;
  inputMode: MetricEntryInputMode;
  base: Prisma.Decimal;
  value: Prisma.Decimal;
}): Prisma.Decimal {
  if (input.storageMode === "CUMULATIVE") {
    return input.inputMode === "INCREMENTAL" ? input.base.add(input.value) : input.value;
  }
  return input.inputMode === "CUMULATIVE" ? input.value.sub(input.base) : input.value;
}

/**
 * Lũy kế gần nhất trước một ngày — dùng cho chỉ tiêu lưu dạng lũy kế.
 * Ưu tiên bản ghi gần nhất, sau đó mốc mở đầu kỳ đã xác nhận/khóa.
 */
export async function cumulativeBaseBefore(
  metricId: string,
  classificationId: string,
  before: Date
): Promise<Prisma.Decimal> {
  const [previous, opening] = await Promise.all([
    prisma.metricDailyEntry.findFirst({
      where: { metricId, classificationId, entryDate: { lt: before } },
      orderBy: { entryDate: "desc" },
      select: { valueNumeric: true },
    }),
    prisma.metricBaseline.findFirst({
      where: {
        metricId,
        classificationId,
        cumKind: "OPENING",
        asOfDate: { lt: before },
        status: { in: ["CONFIRMED", "LOCKED"] },
      },
      orderBy: { asOfDate: "desc" },
      select: { valueNumeric: true },
    }),
  ]);

  return previous?.valueNumeric ?? opening?.valueNumeric ?? new Prisma.Decimal(0);
}

/**
 * Lũy kế năm đến một ngày — dùng cho chỉ tiêu lưu dạng phát sinh.
 * Công thức giống màn hình "Tính từ lũy kế":
 * mốc YEAR gần nhất + tổng phát sinh sau mốc đến ngày đó.
 */
export async function incrementalYtdAt(
  metricId: string,
  classificationId: string,
  asOf: Date
): Promise<Prisma.Decimal> {
  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));

  const baseline = await prisma.metricBaseline.findFirst({
    where: {
      metricId,
      classificationId,
      cumKind: "YEAR",
      status: { in: ["CONFIRMED", "LOCKED"] },
      asOfDate: { gte: yearStart, lte: asOf },
    },
    orderBy: { asOfDate: "desc" },
    select: { valueNumeric: true, asOfDate: true },
  });

  const sumStart = baseline ? new Date(baseline.asOfDate.getTime() + 86400000) : yearStart;
  const aggregate = await prisma.metricDailyEntry.aggregate({
    where: { metricId, classificationId, entryDate: { gte: sumStart, lte: asOf } },
    _sum: { valueNumeric: true },
  });

  const base = baseline?.valueNumeric ?? new Prisma.Decimal(0);
  return base.add(aggregate._sum.valueNumeric ?? new Prisma.Decimal(0));
}

/**
 * Lũy kế đầu kỳ của một chỉ tiêu/phân loại, đúng theo cách lưu:
 * - lưu lũy kế: lấy bản ghi lũy kế gần nhất trước kỳ;
 * - lưu phát sinh: lấy lũy kế năm đến hết ngày trước kỳ.
 */
export async function periodOpeningBalance(
  metric: { id: string; derivation?: unknown },
  classificationId: string,
  periodStart: Date
): Promise<Prisma.Decimal> {
  if (metricInputMode(metric) === "CUMULATIVE") {
    return cumulativeBaseBefore(metric.id, classificationId, periodStart);
  }
  return incrementalYtdAt(metric.id, classificationId, dayBefore(periodStart));
}

/** Số phát sinh của kỳ đối với một bản ghi lũy kế đã lưu. */
export async function cumulativePeriodValue(
  metricId: string,
  classificationId: string,
  entryDate: Date,
  currentValue: Prisma.Decimal
): Promise<Prisma.Decimal> {
  const base = await cumulativeBaseBefore(metricId, classificationId, entryDate);
  return currentValue.sub(base);
}
