import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  MetricAdjustmentError,
  createCumulativeAdjustment,
  listCumulativeAdjustments,
} from "@/server/metric-baseline-adjustments";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof MetricAdjustmentError) return jsonError(error.message, error.statusCode);
  console.error("GET/POST /api/metrics/baseline-adjustments error:", error);
  return jsonError("Lỗi hệ thống khi xử lý điều chỉnh lũy kế.", 500);
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { searchParams } = new URL(req.url);
    const metricId = searchParams.get("metricId")?.trim() || undefined;
    const yearRaw = searchParams.get("year");
    const year = yearRaw ? Number(yearRaw) : undefined;
    const adjustments = await listCumulativeAdjustments(user, {
      metricId,
      year: year && Number.isFinite(year) ? year : undefined,
    });
    return NextResponse.json({ success: true, adjustments });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("Dữ liệu không hợp lệ", 400);
    const adjustment = await createCumulativeAdjustment(user, body as Record<string, unknown>);
    return NextResponse.json({ success: true, adjustment });
  } catch (error) {
    return fail(error);
  }
}
