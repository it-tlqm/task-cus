import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  MetricAdjustmentError,
  confirmCumulativeAdjustment,
  updateCumulativeAdjustment,
} from "@/server/metric-baseline-adjustments";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof MetricAdjustmentError) return jsonError(error.message, error.statusCode);
  console.error("PATCH/POST /api/metrics/baseline-adjustments/[id] error:", error);
  return jsonError("Lỗi hệ thống khi xử lý điều chỉnh lũy kế.", 500);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("Dữ liệu không hợp lệ", 400);
    const adjustment = await updateCumulativeAdjustment(user, id, body as Record<string, unknown>);
    return NextResponse.json({ success: true, adjustment });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("Dữ liệu không hợp lệ", 400);
    const action = String((body as Record<string, unknown>).action || "").trim();
    if (action !== "confirm") return jsonError("Thao tác điều chỉnh lũy kế không hợp lệ.", 400);
    const adjustment = await confirmCumulativeAdjustment(user, id, body as Record<string, unknown>);
    return NextResponse.json({ success: true, adjustment });
  } catch (error) {
    return fail(error);
  }
}
