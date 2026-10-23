import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  MetricTargetError,
  createMetricTarget,
  listMetricTargets,
} from "@/server/metric-targets";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof MetricTargetError) return jsonError(error.message, error.statusCode);
  console.error("GET/POST /api/metrics/targets error:", error);
  return jsonError("Lỗi hệ thống khi xử lý chỉ tiêu giao.", 500);
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const metricId = searchParams.get("metricId")?.trim() || undefined;
    const yearRaw = searchParams.get("year");
    const year = yearRaw ? Number(yearRaw) : undefined;
    const periodType = searchParams.get("periodType")?.trim() || undefined;
    const periodNoRaw = searchParams.get("periodNo");
    const periodNo = periodNoRaw === null || periodNoRaw === "" ? undefined : Number(periodNoRaw);

    const targets = await listMetricTargets(user, {
      metricId,
      year: year && Number.isFinite(year) ? year : undefined,
      periodType,
      periodNo: periodNo !== undefined && Number.isFinite(periodNo) ? periodNo : undefined,
    });

    return NextResponse.json({ success: true, targets });
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

    const target = await createMetricTarget(user, body as Record<string, unknown>);
    return NextResponse.json({ success: true, target });
  } catch (error) {
    return fail(error);
  }
}
