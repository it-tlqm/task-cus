import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export type MetricEntryInputMode = "INCREMENTAL" | "CUMULATIVE";

/**
 * Quy đổi giá trị người dùng nhập về số lũy kế chuẩn hoá cho chỉ tiêu lũy kế.
 *
 * - Nhập phát sinh: lũy kế mới = lũy kế trước kỳ + số phát sinh.
 * - Nhập lũy kế: giữ nguyên tổng người dùng nhập.
 *
 * Không cần thêm cột CSDL: số lũy kế vẫn lưu ở `value_numeric` như cũ.
 */
export function normalizeCumulativeValue(input: {
  base: Prisma.Decimal;
  inputMode: MetricEntryInputMode;
  value: Prisma.Decimal;
}): Prisma.Decimal {
  return input.inputMode === "INCREMENTAL" ? input.base.add(input.value) : input.value;
}

/**
 * Số lũy kế gần nhất trước ngày nhập:
 * - ưu tiên bản ghi số liệu gần nhất trước ngày đó;
 * - nếu chưa có, dùng mốc mở đầu kỳ (OPENING) đã xác nhận/khóa;
 * - còn lại coi như bắt đầu từ 0.
 */
export async function cumulativeBaseBefore(
  metricId: string,
  classificationId: string,
  before: Date
): Promise<Prisma.Decimal> {
  const [previous, opening] = await Promise.all([
    prisma.metricDailyEntry.findFirst({
      where: {
        metricId,
        classificationId,
        entryDate: { lt: before },
      },
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
 * Số phát sinh của kỳ đối với một bản ghi lũy kế đã lưu:
 * lũy kế hiện tại − lũy kế trước kỳ.
 */
export async function cumulativePeriodValue(
  metricId: string,
  classificationId: string,
  entryDate: Date,
  currentValue: Prisma.Decimal
): Promise<Prisma.Decimal> {
  const base = await cumulativeBaseBefore(metricId, classificationId, entryDate);
  return currentValue.sub(base);
}
