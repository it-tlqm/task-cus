import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  dateOnlyFromStr,
  dateOnlyToStr,
  permForMetric,
  resolveEntryPerms,
} from "@/server/metrics";
import { entryPeriodBounds, parseEntryPeriod } from "@/lib/metric-entry-period";

const D = Prisma.Decimal;

function previousDate(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const metricId = searchParams.get("metricId")?.trim() || "";
    const classificationId = searchParams.get("classificationId") || "";
    const asOfRaw = searchParams.get("asOf")?.trim() || "";
    const asOf = dateOnlyFromStr(asOfRaw);
    const entryPeriodParam = searchParams.get("entryPeriod");
    const entryPeriod = entryPeriodParam ? parseEntryPeriod(entryPeriodParam) : "DAY";
    if (entryPeriodParam && !entryPeriod) {
      return jsonError("Kỳ nhập không hợp lệ (DAY/WEEK/MONTH/QUARTER/YEAR)", 400);
    }
    if (!metricId) return jsonError("Thiếu chỉ tiêu", 400);
    if (!asOf) return jsonError("Ngày không hợp lệ (YYYY-MM-DD)", 400);

    const metric = await prisma.metricDefinition.findUnique({ where: { id: metricId } });
    if (!metric || !metric.active) return jsonError("Chỉ tiêu không tồn tại hoặc đã ngừng dùng", 404);

    if (classificationId) {
      const classification = await prisma.metricClassification.findFirst({
        where: { id: classificationId, metricId, active: true },
        select: { id: true },
      });
      if (!classification) return jsonError("Phân loại không thuộc chỉ tiêu", 400);
    }

    const perms = await resolveEntryPerms(user);
    const p = permForMetric(perms, metric);
    if (!perms.all && !p.canEnter && !p.canConfirm) {
      return jsonError("Bạn không có quyền xem lũy kế của chỉ tiêu này", 403);
    }

    const period = entryPeriodBounds(entryPeriod || "DAY", dateOnlyToStr(asOf));
    const periodStart = dateOnlyFromStr(period.start) || asOf;
    const prevDay = previousDate(periodStart);
    const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));

    if (metric.valueKind === "BALANCE") {
      const latest = await prisma.metricDailyEntry.findFirst({
        where: {
          metricId,
          classificationId,
          entryDate: { lte: prevDay },
        },
        orderBy: { entryDate: "desc" },
        select: { valueNumeric: true, entryDate: true },
      });
      return NextResponse.json({
        success: true,
        asOf: dateOnlyToStr(asOf),
        entryPeriod: entryPeriod || "DAY",
        period,
        previousDate: dateOnlyToStr(prevDay),
        cumulativePrevious: latest ? latest.valueNumeric.toString() : "0",
        valueKind: metric.valueKind,
        hasBaseline: false,
        entryCount: latest ? 1 : 0,
        latestEntryDate: latest ? dateOnlyToStr(latest.entryDate) : null,
      });
    }

    if (metric.valueKind !== "FLOW") {
      return jsonError("Chỉ hỗ trợ tính lũy kế cho chỉ tiêu phát sinh hoặc số dư", 400);
    }

    const baseline = await prisma.metricBaseline.findFirst({
      where: {
        metricId,
        classificationId,
        cumKind: "YEAR",
        status: { in: ["CONFIRMED", "LOCKED"] },
        asOfDate: { gte: yearStart, lte: prevDay },
      },
      orderBy: { asOfDate: "desc" },
      select: { valueNumeric: true, asOfDate: true },
    });

    const sumStart = baseline
      ? new Date(baseline.asOfDate.getTime() + 86400000)
      : yearStart;
    const aggregate = await prisma.metricDailyEntry.aggregate({
      where: {
        metricId,
        classificationId,
        entryDate: { gte: sumStart, lte: prevDay },
      },
      _sum: { valueNumeric: true },
      _count: { _all: true },
    });

    const baseValue = baseline ? baseline.valueNumeric : new D(0);
    const cumulative = baseValue.add(aggregate._sum.valueNumeric || new D(0));

    return NextResponse.json({
      success: true,
      asOf: dateOnlyToStr(asOf),
      entryPeriod: entryPeriod || "DAY",
      period,
      previousDate: dateOnlyToStr(prevDay),
      cumulativePrevious: cumulative.toString(),
      valueKind: metric.valueKind,
      hasBaseline: !!baseline,
      baselineAsOf: baseline ? dateOnlyToStr(baseline.asOfDate) : null,
      entryCount: aggregate._count._all,
    });
  } catch (error: any) {
    console.error("GET /api/metrics/entries/cumulative error:", error);
    return jsonError("Lỗi khi tính lũy kế", 500);
  }
}
