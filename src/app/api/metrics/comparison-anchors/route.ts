import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  MetricAdjustmentError,
  confirmCumulativeAdjustment,
  createCumulativeAdjustment,
  updateCumulativeAdjustment,
} from "@/server/metric-baseline-adjustments";
import { dateOnlyFromStr, dateOnlyToStr, todayVnDateOnly } from "@/server/metrics";

type ComparisonPeriod = "CURRENT_MONTH" | "PREV_MONTH" | "LAST_YEAR";

function isPeriod(value: unknown): value is ComparisonPeriod {
  return value === "CURRENT_MONTH" || value === "PREV_MONTH" || value === "LAST_YEAR";
}

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

/**
 * Nhập tay số liệu lịch sử cho khối so sánh:
 * - CURRENT_MONTH: lũy kế tháng hiện tại (baseline tháng, thay cho dữ liệu ngày cũ)
 * - PREV_MONTH: tổng cả tháng trước (dùng cho dòng "So với tháng trước")
 * - LAST_YEAR: tổng cả tháng cùng kỳ năm trước
 *
 * Ghi vào metric_baselines (MONTH) qua service có sẵn để giữ audit/revision/quyền.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("Dữ liệu không hợp lệ", 400);

    const metricId = typeof body.metricId === "string" ? body.metricId.trim() : "";
    const period = body.period;
    const classificationId = typeof body.classificationId === "string" ? body.classificationId : "";
    const value = body.value;
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "Bổ sung số liệu lịch sử để so sánh";
    if (!metricId) return jsonError("Thiếu chỉ tiêu", 400);
    if (!isPeriod(period)) return jsonError("Loại kỳ so sánh không hợp lệ", 400);

    const metric = await prisma.metricDefinition.findUnique({
      where: { id: metricId },
      select: { id: true, active: true },
    });
    if (!metric || !metric.active) return jsonError("Chỉ tiêu không tồn tại hoặc đã tắt", 404);

    if (classificationId) {
      const classification = await prisma.metricClassification.findFirst({
        where: { id: classificationId, metricId },
        select: { id: true },
      });
      if (!classification) return jsonError("Phân loại không thuộc chỉ tiêu đã chọn", 400);
    }

    const anchor = dateOnlyFromStr(String(body.anchorDate || "")) || todayVnDateOnly();
    const anchorYear = anchor.getUTCFullYear();
    const anchorMonth = anchor.getUTCMonth();

    let asOf: Date;
    if (period === "CURRENT_MONTH") {
      asOf = anchor;
    } else if (period === "PREV_MONTH") {
      asOf = lastDayOfMonth(anchorMonth === 0 ? anchorYear - 1 : anchorYear, (anchorMonth + 11) % 12);
    } else {
      asOf = lastDayOfMonth(anchorYear - 1, anchorMonth);
    }

    const monthStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
    const monthEnd = lastDayOfMonth(asOf.getUTCFullYear(), asOf.getUTCMonth());
    const existing =
      period === "CURRENT_MONTH"
        ? await prisma.metricBaseline.findFirst({
            where: {
              metricId,
              classificationId,
              cumKind: "MONTH",
              asOfDate: { gte: monthStart, lte: monthEnd },
            },
            orderBy: { asOfDate: "desc" },
            select: { id: true },
          })
        : await prisma.metricBaseline.findUnique({
            where: {
              metricId_classificationId_cumKind_asOfDate: {
                metricId,
                classificationId,
                cumKind: "MONTH",
                asOfDate: asOf,
              },
            },
            select: { id: true },
          });

    const input = {
      metricId,
      classificationId,
      cumKind: "MONTH",
      asOfDate: dateOnlyToStr(asOf),
      value,
      reason,
      sourceNote: "Số liệu lịch sử nhập từ Tổng quan điều hành",
    };

    const adjustment = existing
      ? await updateCumulativeAdjustment(user, existing.id, input)
      : await createCumulativeAdjustment(user, input);

    let confirmed = false;
    try {
      await confirmCumulativeAdjustment(user, adjustment.id, { reason });
      confirmed = true;
    } catch (error) {
      if (!(error instanceof MetricAdjustmentError)) throw error;
    }

    return NextResponse.json({
      success: true,
      confirmed,
      adjustment,
      asOfDate: dateOnlyToStr(asOf),
      message: confirmed
        ? "Đã lưu số liệu lịch sử."
        : "Đã ghi nhận số liệu, đang chờ người có quyền xác nhận.",
    });
  } catch (error) {
    if (error instanceof MetricAdjustmentError) {
      return jsonError(error.message, error.statusCode);
    }
    console.error("POST /api/metrics/comparison-anchors error:", error);
    return jsonError("Lỗi hệ thống khi lưu số liệu so sánh", 500);
  }
}
